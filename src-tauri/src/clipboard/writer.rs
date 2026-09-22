//! Writing to the Windows clipboard.
//!
//! Every writer goes through [`with_clipboard`] and [`set_clipboard_bytes`] so
//! the open/empty/close bookkeeping — and the ownership rule for the global
//! memory handle — exists exactly once. Getting that wrong leaks memory or,
//! worse, leaves the clipboard empty while reporting success.

/// `CF_UNICODETEXT`. Not re-exported by the `windows` crate's DataExchange
/// module in this version, so the literal is used directly.
const CF_UNICODETEXT: u32 = 13;
/// `CF_DIB`. Same reason as above.
const CF_DIB: u32 = 8;

/// Open the clipboard, empty it, run `fill`, then close it.
///
/// The close happens on every path, including failures: a clipboard left open
/// blocks every other process that wants to read or write it, which looks like
/// the whole system's copy-paste breaking.
///
/// # Safety
/// Calls Win32 clipboard functions, which are process-global and not
/// thread-safe. Callers must hold [`crate::clipboard::CLIPBOARD_LOCK`] in tests.
#[cfg(target_os = "windows")]
unsafe fn with_clipboard<T>(fill: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard};

    if OpenClipboard(None).is_err() {
        return Err("无法打开剪贴板".to_string());
    }

    let result = (|| {
        if EmptyClipboard().is_err() {
            return Err("无法清空剪贴板".to_string());
        }
        fill()
    })();

    let _ = CloseClipboard();
    result
}

/// Hand `bytes` to the clipboard as `format`.
///
/// Must be called with the clipboard already open and emptied. On success the
/// clipboard takes ownership of the handle and it must not be freed; only the
/// failure paths here free it.
#[cfg(target_os = "windows")]
unsafe fn set_clipboard_bytes(format: u32, bytes: &[u8]) -> Result<(), String> {
    use windows::Win32::Foundation::{GlobalFree, HANDLE};
    use windows::Win32::System::DataExchange::SetClipboardData;
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

    let h = GlobalAlloc(GMEM_MOVEABLE, bytes.len())
        .map_err(|_| "无法分配剪贴板内存".to_string())?;

    let ptr = GlobalLock(h);
    if ptr.is_null() {
        let _ = GlobalFree(h);
        return Err("无法锁定剪贴板内存".to_string());
    }
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr as *mut u8, bytes.len());
    let _ = GlobalUnlock(h);

    if SetClipboardData(format, HANDLE(h.0)).is_err() {
        let _ = GlobalFree(h);
        return Err("无法写入剪贴板".to_string());
    }
    Ok(())
}

/// UTF-16, little-endian, NUL-terminated — the layout `CF_UNICODETEXT` expects.
///
/// `encode_utf16` emits surrogate pairs for characters outside the BMP (e.g.
/// emoji), which is why this goes through `u16` rather than `as_bytes`.
#[cfg(target_os = "windows")]
fn utf16_bytes(content: &str) -> Vec<u8> {
    content
        .encode_utf16()
        .chain(std::iter::once(0))
        .flat_map(u16::to_le_bytes)
        .collect()
}

/// Writes `content` to the Windows system clipboard as CF_UNICODETEXT.
///
/// Errors are sanitized generic messages and never include the clipboard
/// content. The clipboard content is never logged.
#[cfg(target_os = "windows")]
pub fn write_clipboard_text(content: &str) -> Result<(), String> {
    let bytes = utf16_bytes(content);
    unsafe { with_clipboard(|| set_clipboard_bytes(CF_UNICODETEXT, &bytes)) }
}

#[cfg(not(target_os = "windows"))]
pub fn write_clipboard_text(_content: &str) -> Result<(), String> {
    Err("当前平台暂不支持写入剪贴板".to_string())
}

/// Writes a stored BMP file to the clipboard as `CF_DIB`.
///
/// `CF_DIB` rather than `CF_BITMAP`: a device-dependent bitmap handle would have
/// to be created against a screen DC and owned by the clipboard, which is far
/// more to get wrong. Every consumer that accepts an image off the clipboard
/// accepts a DIB.
#[cfg(target_os = "windows")]
pub fn write_clipboard_image(bmp: &[u8]) -> Result<(), String> {
    // Converted before touching the clipboard, so a malformed file leaves the
    // user's current clipboard contents alone instead of emptying them.
    let dib = crate::clipboard::image::bmp_to_dib(bmp)?;
    unsafe { with_clipboard(|| set_clipboard_bytes(CF_DIB, &dib)) }
}

#[cfg(not(target_os = "windows"))]
pub fn write_clipboard_image(_bmp: &[u8]) -> Result<(), String> {
    Err("当前平台暂不支持写入剪贴板".to_string())
}

/// Put text *and* a bitmap on the clipboard in a single session.
///
/// Test-only — a real copy is one or the other. It exists to pin the
/// "text wins" rule in `watcher::read_clipboard`: copying out of a browser or an
/// editor usually offers both flavours, and storing the screenshot instead of
/// the text would be a silent, very annoying regression.
#[cfg(all(test, target_os = "windows"))]
pub(crate) fn write_clipboard_text_and_image(text: &str, bmp: &[u8]) -> Result<(), String> {
    let dib = crate::clipboard::image::bmp_to_dib(bmp)?;
    let text_bytes = utf16_bytes(text);

    unsafe {
        with_clipboard(|| {
            set_clipboard_bytes(CF_UNICODETEXT, &text_bytes)?;
            set_clipboard_bytes(CF_DIB, &dib)
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::clipboard::CLIPBOARD_LOCK;

    #[test]
    fn write_clipboard_text_success() {
        let _guard = CLIPBOARD_LOCK.lock().unwrap();
        let text = "hello clipboard 剪贴板";
        super::write_clipboard_text(text).expect("write should succeed");
        let read = crate::clipboard::watcher::get_clipboard_text();
        assert_eq!(read.as_deref(), Some(text));
    }

    #[test]
    fn unicode_roundtrip() {
        let _guard = CLIPBOARD_LOCK.lock().unwrap();
        let text = "你好，世界! 🚀 测试";
        super::write_clipboard_text(text).expect("write should succeed");
        let read = crate::clipboard::watcher::get_clipboard_text();
        assert_eq!(read.as_deref(), Some(text));
    }

    #[test]
    fn empty_string() {
        let _guard = CLIPBOARD_LOCK.lock().unwrap();
        super::write_clipboard_text("").expect("empty write should succeed");
        let read = crate::clipboard::watcher::get_clipboard_text();
        assert_eq!(read.as_deref(), Some(""));
    }

    /// A 2x2 bottom-up 24-bit DIB with distinguishable pixels.
    #[cfg(target_os = "windows")]
    fn two_by_two_dib() -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&40u32.to_le_bytes()); // biSize
        out.extend_from_slice(&2i32.to_le_bytes()); // width
        out.extend_from_slice(&2i32.to_le_bytes()); // height, bottom-up
        out.extend_from_slice(&1u16.to_le_bytes()); // planes
        out.extend_from_slice(&24u16.to_le_bytes()); // bit count
        out.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
        out.extend_from_slice(&0u32.to_le_bytes()); // sizeImage
        out.extend_from_slice(&0i32.to_le_bytes()); // xppm
        out.extend_from_slice(&0i32.to_le_bytes()); // yppm
        out.extend_from_slice(&0u32.to_le_bytes()); // clrUsed
        out.extend_from_slice(&0u32.to_le_bytes()); // clrImportant
        out.extend_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]); // bottom row
        out.extend_from_slice(&[9, 10, 11, 12, 13, 14, 15, 16]); // top row
        out
    }

    /// Copy-back end to end: encode a capture, put it on the clipboard, read the
    /// DIB back off the clipboard, and check the pixels are untouched.
    ///
    /// This is the test that catches an orientation mistake — a mirrored paste
    /// still "works", it is just wrong, and nothing else would notice.
    #[test]
    #[cfg(target_os = "windows")]
    fn write_clipboard_image_roundtrip() {
        let _guard = CLIPBOARD_LOCK.lock().unwrap();

        let source =
            crate::clipboard::image::decode_dib(&two_by_two_dib()).expect("source DIB decodes");
        let bmp = crate::clipboard::image::to_bmp(&source);

        super::write_clipboard_image(&bmp).expect("image write should succeed");

        let read_back = crate::clipboard::watcher::read_clipboard_dib()
            .expect("a DIB should be on the clipboard after writing one");
        let pasted = crate::clipboard::image::decode_dib(&read_back).expect("read-back decodes");

        assert_eq!(pasted, source, "the pasted image must match what was copied");
    }

    #[test]
    fn write_clipboard_image_rejects_a_non_bmp() {
        let _guard = CLIPBOARD_LOCK.lock().unwrap();
        // Fails before the clipboard is touched, so whatever was on it survives.
        assert!(super::write_clipboard_image(b"definitely not a bitmap").is_err());
    }
}
