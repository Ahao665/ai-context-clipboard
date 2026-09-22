use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

/// Upper bound on how much clipboard text is kept for a single entry.
///
/// Without this, copying a whole log file or a minified bundle puts tens of
/// megabytes into SQLite *and* into the FTS index in one go. Anything longer is
/// truncated; `truncated` tells the UI so it can say so out loud instead of
/// silently storing a partial copy that looks complete.
pub const MAX_CLIPBOARD_CHARS: usize = 200_000;

/// Poll interval, used only when the event-driven listener is unavailable.
#[cfg(target_os = "windows")]
const FALLBACK_POLL: Duration = Duration::from_millis(300);
#[cfg(not(target_os = "windows"))]
const FALLBACK_POLL: Duration = Duration::from_secs(1);

/// How many times to retry `OpenClipboard` after a `WM_CLIPBOARDUPDATE`.
///
/// The app that just handled Ctrl+C usually still owns the clipboard for a few
/// milliseconds; giving up immediately is the main reason a naive listener
/// appears to "miss" copies.
#[cfg(target_os = "windows")]
const CLIPBOARD_RETRIES: u32 = 8;
#[cfg(target_os = "windows")]
const RETRY_DELAY: Duration = Duration::from_millis(25);

/// Where a captured image lives on disk, plus what the UI needs to describe it.
///
/// Only metadata crosses the IPC boundary; the BMP bytes are fetched on demand
/// by the `get_entry_image` command. Sending megabytes of base64 through the
/// clipboard event would stall the panel on every screenshot.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ImageCapture {
    /// File name inside the images directory, e.g. `<sha256>.bmp`.
    pub file_name: String,
    /// Downscaled companion used by list rows.
    pub thumbnail_name: String,
    pub width: u32,
    pub height: u32,
    /// Byte length of the stored full-size BMP.
    pub byte_len: usize,
}

/// A single clipboard capture, as delivered to the app.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ClipboardContent {
    pub text: Option<String>,
    pub content_hash: String,
    /// True when the original text was longer than [`MAX_CLIPBOARD_CHARS`].
    pub truncated: bool,
    /// Character count *before* truncation.
    pub original_len: usize,
    /// Executable name of the foreground process at capture time.
    pub source_app: Option<String>,
    /// Title of the foreground window at capture time.
    pub source_window: Option<String>,
    /// Set when the clipboard held a bitmap rather than text.
    pub image: Option<ImageCapture>,
}

impl ClipboardContent {
    /// Build from text alone. Applies the size cap.
    pub fn new(text: Option<String>) -> Self {
        Self::with_source(text, None, None)
    }

    /// Build from text plus the foreground app it came from. Applies the size cap.
    pub fn with_source(
        text: Option<String>,
        source_app: Option<String>,
        source_window: Option<String>,
    ) -> Self {
        let (text, truncated, original_len) = match text {
            Some(t) => {
                let original_len = t.chars().count();
                if original_len > MAX_CLIPBOARD_CHARS {
                    let kept = t.chars().take(MAX_CLIPBOARD_CHARS).collect::<String>();
                    (Some(kept), true, original_len)
                } else {
                    (Some(t), false, original_len)
                }
            }
            None => (None, false, 0),
        };

        let content_hash = text
            .as_deref()
            .map(|t| {
                let mut hasher = Sha256::new();
                hasher.update(t.as_bytes());
                format!("{:x}", hasher.finalize())
            })
            .unwrap_or_default();

        Self {
            text,
            content_hash,
            truncated,
            original_len,
            source_app,
            source_window,
            image: None,
        }
    }

    /// Build from an image capture.
    ///
    /// `content_hash` is the hash of the stored BMP bytes, so re-copying the
    /// same picture dedupes exactly the way repeated text copies do.
    pub fn with_image(
        image: ImageCapture,
        content_hash: String,
        source_app: Option<String>,
        source_window: Option<String>,
    ) -> Self {
        Self {
            text: None,
            content_hash,
            truncated: false,
            original_len: 0,
            source_app,
            source_window,
            image: Some(image),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.image.is_none() && self.text.as_deref().map_or(true, |t| t.is_empty())
    }
}

/// Start watching the clipboard and forward every *new* value to `tx`.
///
/// On Windows this is event-driven: a message-only window registered with
/// `AddClipboardFormatListener` receives `WM_CLIPBOARDUPDATE`, so nothing is
/// polled and two copies in quick succession cannot be missed. If the listener
/// cannot be created the function silently degrades to the older polling loop —
/// a slower watcher beats no watcher.
pub fn start_clipboard_watcher(tx: mpsc::Sender<ClipboardContent>, images_dir: PathBuf) {
    let (signal_tx, signal_rx) = mpsc::channel::<()>();
    let event_driven = start_listener(signal_tx).is_ok();

    thread::spawn(move || {
        let mut last_hash = String::new();
        loop {
            if event_driven {
                // Blocks until Windows reports a clipboard change.
                if signal_rx.recv().is_err() {
                    break; // listener thread is gone
                }
            } else {
                thread::sleep(FALLBACK_POLL);
            }

            let content = read_clipboard(&images_dir);
            if !content.is_empty() && content.content_hash != last_hash {
                last_hash = content.content_hash.clone();
                let _ = tx.send(content);
            }
        }
    });
}

/// Read the clipboard and attach the foreground app it came from.
///
/// Text wins when both flavours are present: a copy out of a browser or an
/// editor usually offers a bitmap alongside the text, and the text is what the
/// user meant.
fn read_clipboard(images_dir: &Path) -> ClipboardContent {
    let text = get_clipboard_text();

    if text.as_deref().map_or(true, |t| t.is_empty()) {
        if let Some(content) = read_clipboard_image(images_dir) {
            return content;
        }
        // Nothing storable — empty, or an image format that cannot be decoded.
        // `new` yields an empty capture, which the watcher drops.
        return ClipboardContent::new(text);
    }

    // Skip the window/process lookup when there is nothing to store.
    let (source_app, source_window) = foreground_app();
    ClipboardContent::with_source(text, source_app, source_window)
}

/// Read a bitmap off the clipboard, write it to `images_dir`, and describe it.
///
/// Fails closed: any problem (an unsupported format, an unwritable directory)
/// returns `None`, which leaves the capture path behaving exactly as it did
/// before image support existed. Losing an image is acceptable; breaking text
/// capture is not.
#[cfg(target_os = "windows")]
fn read_clipboard_image(images_dir: &Path) -> Option<ClipboardContent> {
    let dib = read_clipboard_dib()?;

    let encoded = match crate::clipboard::image::encode_capture(&dib) {
        Ok(encoded) => encoded,
        Err(err) => {
            // e.g. an 8-bit or RLE-compressed bitmap. Say so rather than leaving
            // the user with a copy that appears to do nothing at all.
            eprintln!("[clipboard] 跳过图片：{err}");
            return None;
        }
    };

    let hash = hash_bytes(&encoded.full);
    let file_name = format!("{hash}.bmp");
    let thumbnail_name = format!("{hash}.thumb.bmp");

    if let Err(err) = std::fs::create_dir_all(images_dir) {
        eprintln!("[clipboard] 创建图片目录失败：{err}");
        return None;
    }
    if let Err(err) = std::fs::write(images_dir.join(&file_name), &encoded.full) {
        eprintln!("[clipboard] 写入图片失败：{err}");
        return None;
    }
    // The thumbnail is a convenience; losing it only costs list-row rendering.
    let _ = std::fs::write(images_dir.join(&thumbnail_name), &encoded.thumbnail);

    let (source_app, source_window) = foreground_app();
    Some(ClipboardContent::with_image(
        ImageCapture {
            file_name,
            thumbnail_name,
            width: encoded.width,
            height: encoded.height,
            byte_len: encoded.full.len(),
        },
        hash,
        source_app,
        source_window,
    ))
}

#[cfg(not(target_os = "windows"))]
fn read_clipboard_image(_images_dir: &Path) -> Option<ClipboardContent> {
    None
}

/// Raw `CF_DIB` bytes, retrying while another process holds the clipboard.
///
/// Also the read half of the image copy-back round-trip test, hence the wider
/// visibility than the rest of this module's helpers.
#[cfg(target_os = "windows")]
pub(crate) fn read_clipboard_dib() -> Option<Vec<u8>> {
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    // CF_DIB = 8, CF_DIBV5 = 17. Neither is re-exported by the `windows` crate's
    // DataExchange module in this version, so the literals are used directly.
    const CF_DIB: u32 = 8;
    const CF_DIBV5: u32 = 17;

    for attempt in 0..CLIPBOARD_RETRIES {
        unsafe {
            if OpenClipboard(None).is_err() {
                if attempt + 1 < CLIPBOARD_RETRIES {
                    thread::sleep(RETRY_DELAY);
                }
                continue;
            }

            let mut found = None;
            // V5 is tried first: when an app offers both, the newer header
            // carries the same pixels plus colour-space information.
            for format in [CF_DIBV5, CF_DIB] {
                let Ok(handle) = GetClipboardData(format) else {
                    continue;
                };
                if handle.is_invalid() {
                    continue;
                }

                let hg = HGLOBAL(handle.0);
                let ptr = GlobalLock(hg);
                if ptr.is_null() {
                    continue;
                }

                // The size comes from the allocator, not from the header —
                // `biSizeImage` is frequently zero on clipboard bitmaps.
                let size = GlobalSize(hg);
                if size > 0 {
                    let bytes = std::slice::from_raw_parts(ptr as *const u8, size);
                    found = Some(bytes.to_vec());
                }
                let _ = GlobalUnlock(hg);

                if found.is_some() {
                    break;
                }
            }

            let _ = CloseClipboard();
            // The clipboard opened cleanly, so a retry would not change the
            // answer: either a bitmap was there or there was none.
            return found;
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn read_clipboard_dib() -> Option<Vec<u8>> {
    None
}

/// SHA-256 of arbitrary bytes, hex-encoded.
fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

/// Read the clipboard text, retrying while another process holds the clipboard.
///
/// `None` covers both "no text on the clipboard" (e.g. an image) and "gave up
/// retrying"; neither is worth distinguishing for the caller's purposes.
fn read_clipboard_text_with_retry() -> Option<String> {
    for attempt in 0..CLIPBOARD_RETRIES {
        match try_read_text() {
            // `Ok(None)` = clipboard open, but holds no text (e.g. an image).
            Ok(text) => return text,
            Err(()) => {
                if attempt + 1 < CLIPBOARD_RETRIES {
                    thread::sleep(RETRY_DELAY);
                }
            }
        }
    }
    None
}

/// Text-only clipboard read.
///
/// Kept as the public primitive (also used by the writer round-trip tests);
/// [`read_clipboard`] is the richer capture the watcher uses.
#[cfg(target_os = "windows")]
pub(crate) fn get_clipboard_text() -> Option<String> {
    read_clipboard_text_with_retry()
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn get_clipboard_text() -> Option<String> {
    None
}

/// `Ok(text)` on success — `text` is `None` when the clipboard holds no text.
/// `Err(())` when another process held the clipboard, so the caller can retry.
#[cfg(target_os = "windows")]
fn try_read_text() -> Result<Option<String>, ()> {
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::DataExchange::*;
    use windows::Win32::System::Memory::*;

    // CF_UNICODETEXT = 13. Not re-exported by the `windows` crate's
    // DataExchange module in this version, so the literal is used directly.
    const CF_UNICODETEXT: u32 = 13;

    unsafe {
        if OpenClipboard(None).is_err() {
            return Err(());
        }

        let text = match GetClipboardData(CF_UNICODETEXT) {
            Ok(handle) if !handle.is_invalid() => {
                let hg = HGLOBAL(handle.0);
                let ptr = GlobalLock(hg);
                if ptr.is_null() {
                    None
                } else {
                    let ptr_u16 = ptr as *const u16;
                    let len = (0..).take_while(|&i| *ptr_u16.add(i) != 0).count();
                    let slice = std::slice::from_raw_parts(ptr_u16, len);
                    let s = String::from_utf16_lossy(slice);
                    let _ = GlobalUnlock(hg);
                    Some(s)
                }
            }
            _ => None,
        };

        let _ = CloseClipboard();
        Ok(text)
    }
}

#[cfg(not(target_os = "windows"))]
fn try_read_text() -> Result<Option<String>, ()> {
    Ok(None)
}

/// Foreground process name and window title, or `(None, None)`.
///
/// Called right after a clipboard update: Ctrl+C does not change the foreground
/// window, so this identifies the app the user copied *from*.
#[cfg(target_os = "windows")]
fn foreground_app() -> (Option<String>, Option<String>) {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, BOOL};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return (None, None);
        }

        let mut title_buf = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, &mut title_buf);
        let window = (title_len > 0)
            .then(|| String::from_utf16_lossy(&title_buf[..title_len as usize]));

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return (None, window);
        }

        // PROCESS_QUERY_LIMITED_INFORMATION works for elevated processes too,
        // which plain PROCESS_QUERY_INFORMATION does not.
        let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, BOOL(0), pid) {
            Ok(h) => h,
            Err(_) => return (None, window),
        };

        let mut path_buf = [0u16; 1024];
        let mut size = path_buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(path_buf.as_mut_ptr()),
            &mut size,
        )
        .is_ok();
        let _ = CloseHandle(handle);

        let app = ok.then(|| {
            let full = String::from_utf16_lossy(&path_buf[..size as usize]);
            // Keep only the file name — the full path is noise in the UI.
            full.rsplit(['\\', '/']).next().unwrap_or(&full).to_string()
        });

        (app, window)
    }
}

#[cfg(not(target_os = "windows"))]
fn foreground_app() -> (Option<String>, Option<String>) {
    (None, None)
}

// --- Windows clipboard listener -------------------------------------------

#[cfg(target_os = "windows")]
fn start_listener(signal: mpsc::Sender<()>) -> Result<(), String> {
    listener::spawn(signal)
}

#[cfg(not(target_os = "windows"))]
fn start_listener(_signal: mpsc::Sender<()>) -> Result<(), String> {
    Err("clipboard listener is only implemented on Windows".to_string())
}

#[cfg(target_os = "windows")]
mod listener {
    use super::*;
    use std::sync::{Mutex, OnceLock};
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::HBRUSH;
    use windows::Win32::System::DataExchange::{
        AddClipboardFormatListener, RemoveClipboardFormatListener,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
        TranslateMessage, HCURSOR, HICON, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE,
        WNDCLASSW, WNDCLASS_STYLES,
    };

    /// Posted to every registered listener window when the clipboard changes.
    const WM_CLIPBOARDUPDATE: u32 = 0x031D;

    /// Set once; read from the window procedure, which runs on the listener thread.
    static SIGNAL: OnceLock<Mutex<mpsc::Sender<()>>> = OnceLock::new();

    unsafe extern "system" fn wndproc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_CLIPBOARDUPDATE {
            if let Some(tx) = SIGNAL.get() {
                if let Ok(tx) = tx.lock() {
                    // A send error only means the consumer is gone; a *full*
                    // channel is fine too — a read is already pending.
                    let _ = tx.send(());
                }
            }
            return LRESULT(0);
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    /// Create the message-only window on its own thread and pump its messages.
    ///
    /// Blocks until the window is ready (or failed), so the caller knows whether
    /// to fall back to polling.
    pub(super) fn spawn(signal: mpsc::Sender<()>) -> Result<(), String> {
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
        let _ = SIGNAL.set(Mutex::new(signal));

        thread::spawn(move || unsafe {
            let class_name = w!("AiContextClipboardListener");

            let hinstance = match GetModuleHandleW(None) {
                Ok(h) => h,
                Err(e) => {
                    let _ = ready_tx.send(Err(format!("GetModuleHandleW: {e}")));
                    return;
                }
            };

            let wc = WNDCLASSW {
                style: WNDCLASS_STYLES(0),
                lpfnWndProc: Some(wndproc),
                cbClsExtra: 0,
                cbWndExtra: 0,
                hInstance: HINSTANCE(hinstance.0),
                hIcon: HICON::default(),
                hCursor: HCURSOR::default(),
                hbrBackground: HBRUSH::default(),
                lpszMenuName: PCWSTR::null(),
                lpszClassName: class_name,
            };

            // Deliberately ignore the result: a zero return usually means the
            // class is already registered (e.g. a second watcher in-process), in
            // which case CreateWindowExW below still succeeds. Its error is the
            // one worth reporting.
            let _ = RegisterClassW(&wc);

            let hwnd = match CreateWindowExW(
                WINDOW_EX_STYLE(0),
                class_name,
                PCWSTR::null(),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                HWND_MESSAGE,
                None,
                hinstance,
                None,
            ) {
                Ok(h) => h,
                Err(e) => {
                    let _ = ready_tx.send(Err(format!("CreateWindowExW: {e}")));
                    return;
                }
            };

            if let Err(e) = AddClipboardFormatListener(hwnd) {
                let _ = ready_tx.send(Err(format!("AddClipboardFormatListener: {e}")));
                return;
            }

            let _ = ready_tx.send(Ok(()));

            // `MSG` has no Default impl; all fields are plain integers/handles.
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, hwnd, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            let _ = RemoveClipboardFormatListener(hwnd);
        });

        match ready_rx.recv() {
            Ok(result) => result,
            Err(_) => Err("listener thread exited before reporting readiness".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_content() {
        let content = ClipboardContent::new(None);
        assert!(content.is_empty());
        assert!(content.content_hash.is_empty());
        assert!(!content.truncated);
        assert_eq!(content.original_len, 0);
    }

    #[test]
    fn test_content_hashing() {
        let content = ClipboardContent::new(Some("hello".to_string()));
        assert!(!content.content_hash.is_empty());
        // Same input = same hash
        let content2 = ClipboardContent::new(Some("hello".to_string()));
        assert_eq!(content.content_hash, content2.content_hash);
        // Different input = different hash
        let content3 = ClipboardContent::new(Some("world".to_string()));
        assert_ne!(content.content_hash, content3.content_hash);
    }

    #[test]
    fn test_source_fields_are_carried_through() {
        let content = ClipboardContent::with_source(
            Some("hi".to_string()),
            Some("chrome.exe".to_string()),
            Some("New Tab".to_string()),
        );
        assert_eq!(content.source_app.as_deref(), Some("chrome.exe"));
        assert_eq!(content.source_window.as_deref(), Some("New Tab"));
    }

    #[test]
    fn test_short_text_is_not_truncated() {
        let content = ClipboardContent::new(Some("small".to_string()));
        assert!(!content.truncated);
        assert_eq!(content.original_len, 5);
        assert_eq!(content.text.as_deref(), Some("small"));
    }

    #[test]
    fn test_oversized_text_is_truncated_and_reported() {
        let huge = "a".repeat(MAX_CLIPBOARD_CHARS + 1234);
        let content = ClipboardContent::new(Some(huge));

        assert!(content.truncated, "oversized content must be flagged");
        assert_eq!(content.original_len, MAX_CLIPBOARD_CHARS + 1234);
        assert_eq!(
            content.text.as_deref().map(|t| t.chars().count()),
            Some(MAX_CLIPBOARD_CHARS),
            "stored text must be capped at MAX_CLIPBOARD_CHARS"
        );
        // The hash describes what was actually stored, so dedup stays consistent.
        let again = ClipboardContent::new(Some("a".repeat(MAX_CLIPBOARD_CHARS)));
        assert_eq!(content.content_hash, again.content_hash);
    }

    #[test]
    fn test_truncation_counts_characters_not_bytes() {
        // Multi-byte characters must not be split mid-codepoint.
        let huge = "测".repeat(MAX_CLIPBOARD_CHARS + 10);
        let content = ClipboardContent::new(Some(huge));
        assert!(content.truncated);
        let stored = content.text.unwrap();
        assert_eq!(stored.chars().count(), MAX_CLIPBOARD_CHARS);
        assert!(stored.chars().all(|c| c == '测'), "no replacement characters");
    }

    #[test]
    fn test_exactly_at_limit_is_not_truncated() {
        let content = ClipboardContent::new(Some("x".repeat(MAX_CLIPBOARD_CHARS)));
        assert!(!content.truncated);
        assert_eq!(content.original_len, MAX_CLIPBOARD_CHARS);
    }
}

/// Tests that drive the real Windows clipboard.
///
/// Kept in a separate module so CI can skip them by name: they need a desktop
/// session and **hang** (rather than fail) without one. Everything above this
/// point is pure logic and safe anywhere.
#[cfg(all(test, target_os = "windows"))]
mod desktop {
    use super::*;
    use crate::clipboard::image::{
        downscale, row_stride, thumbnail_name, to_bmp, Pixels, THUMBNAIL_EDGE,
    };
    use crate::clipboard::writer::{
        write_clipboard_image, write_clipboard_text, write_clipboard_text_and_image,
    };
    use crate::clipboard::CLIPBOARD_LOCK;

    /// A 3×2 image whose six pixels are all distinct.
    ///
    /// Every pixel differing from every other is the point: a flipped row or a
    /// stride mistake shows up as a mismatch instead of passing by luck.
    fn sample_image() -> Pixels {
        const PIXELS: [[u8; 3]; 6] = [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
            [10, 11, 12],
            [13, 14, 15],
            [16, 17, 18],
        ];
        let width = 3u32;
        let height = 2u32;
        let stride = row_stride(width, 3);
        let mut data = vec![0u8; stride * height as usize];

        for y in 0..height as usize {
            for x in 0..width as usize {
                // Rows are padded, so the offset is `y * stride + x * 3` — not
                // a running pixel index, which would spill into the padding.
                let offset = y * stride + x * 3;
                data[offset..offset + 3].copy_from_slice(&PIXELS[y * width as usize + x]);
            }
        }

        Pixels {
            width,
            height,
            stride,
            data,
        }
    }

    fn temp_images_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("aicc_capture_{tag}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp images dir");
        dir
    }

    /// The whole capture path against the real clipboard: bitmap in, BMP files
    /// on disk, described well enough for the UI to find them again.
    #[test]
    fn test_capture_writes_an_image_off_the_clipboard_to_disk() {
        let _guard = CLIPBOARD_LOCK.lock().unwrap();
        let dir = temp_images_dir("image");
        let source = sample_image();

        write_clipboard_image(&to_bmp(&source)).expect("put an image on the clipboard");
        let captured = read_clipboard(&dir);

        assert!(
            !captured.is_empty(),
            "a bitmap on the clipboard must not be dropped"
        );
        assert!(captured.text.is_none(), "an image-only copy carries no text");

        let image = captured.image.expect("the capture must describe an image");
        assert_eq!((image.width, image.height), (source.width, source.height));

        // The file is named after the content hash, and the UI looks images up
        // by exactly that name later. A mismatch here means pictures that
        // capture fine and then never render.
        assert_eq!(image.file_name, format!("{}.bmp", captured.content_hash));
        assert_eq!(image.thumbnail_name, thumbnail_name(&image.file_name));

        let full = std::fs::read(dir.join(&image.file_name)).expect("full-size BMP written");
        let thumb = std::fs::read(dir.join(&image.thumbnail_name)).expect("thumbnail written");

        assert_eq!(full.len(), image.byte_len);
        assert_eq!(
            full,
            to_bmp(&source),
            "the stored BMP must be byte-identical to what went in"
        );
        // Too small to downscale, so the thumbnail is a copy rather than an
        // upscale — worth pinning, since upscaling would be pure waste.
        assert_eq!(thumb, full);
    }

    /// Copying out of a browser or an editor usually puts text *and* a bitmap on
    /// the clipboard. Storing the screenshot instead of the text would be a
    /// silent and very annoying regression, so it gets its own test.
    #[test]
    fn test_capture_prefers_text_when_the_clipboard_offers_both() {
        let _guard = CLIPBOARD_LOCK.lock().unwrap();
        let dir = temp_images_dir("text_wins");

        write_clipboard_text_and_image("hello 剪贴板", &to_bmp(&sample_image()))
            .expect("put both flavours on the clipboard");

        let captured = read_clipboard(&dir);

        assert_eq!(
            captured.text.as_deref(),
            Some("hello 剪贴板"),
            "text must win over the bitmap"
        );
        assert!(captured.image.is_none(), "the bitmap must be ignored");

        // The discarded bitmap must not have been written to disk either.
        let written = std::fs::read_dir(&dir).expect("images dir").count();
        assert_eq!(written, 0, "no image files for a text capture");
    }

    /// A capture that cannot be decoded must leave the text path untouched
    /// rather than half-writing files.
    #[test]
    fn test_capture_of_an_empty_clipboard_stores_nothing() {
        let _guard = CLIPBOARD_LOCK.lock().unwrap();
        let dir = temp_images_dir("empty");

        // An empty string is a legitimate clipboard state and must not be
        // mistaken for "no capture".
        write_clipboard_text("").expect("empty text write");
        let captured = read_clipboard(&dir);

        assert!(captured.is_empty(), "an empty copy is not worth storing");
        assert_eq!(std::fs::read_dir(&dir).expect("images dir").count(), 0);
    }

    #[test]
    fn test_downscale_is_a_no_op_for_a_thumbnail_sized_image() {
        let source = sample_image();
        assert_eq!(downscale(&source, THUMBNAIL_EDGE), source);
    }
}
