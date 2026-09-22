use sha2::{Digest, Sha256};
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
        }
    }

    pub fn is_empty(&self) -> bool {
        self.text.as_deref().map_or(true, |t| t.is_empty())
    }
}

/// Start watching the clipboard and forward every *new* value to `tx`.
///
/// On Windows this is event-driven: a message-only window registered with
/// `AddClipboardFormatListener` receives `WM_CLIPBOARDUPDATE`, so nothing is
/// polled and two copies in quick succession cannot be missed. If the listener
/// cannot be created the function silently degrades to the older polling loop —
/// a slower watcher beats no watcher.
pub fn start_clipboard_watcher(tx: mpsc::Sender<ClipboardContent>) {
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

            let content = read_clipboard();
            if !content.is_empty() && content.content_hash != last_hash {
                last_hash = content.content_hash.clone();
                let _ = tx.send(content);
            }
        }
    });
}

/// Read the clipboard and attach the foreground app it came from.
fn read_clipboard() -> ClipboardContent {
    let text = get_clipboard_text();

    // Skip the window/process lookup when there is nothing to store.
    if text.as_deref().map_or(true, |t| t.is_empty()) {
        return ClipboardContent::new(text);
    }

    let (source_app, source_window) = foreground_app();
    ClipboardContent::with_source(text, source_app, source_window)
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
