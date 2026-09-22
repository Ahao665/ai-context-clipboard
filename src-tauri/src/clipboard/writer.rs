/// Writes `content` to the Windows system clipboard as CF_UNICODETEXT.
///
/// Errors are sanitized generic messages and never include the clipboard
/// content. The clipboard content is never logged.
#[cfg(target_os = "windows")]
pub fn write_clipboard_text(content: &str) -> Result<(), String> {
    unsafe {
        use windows::Win32::Foundation::{GlobalFree, HANDLE};
        use windows::Win32::System::DataExchange::{
            CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
        };
        use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

        if OpenClipboard(None).is_err() {
            return Err("无法打开剪贴板".to_string());
        }

        // CF_UNICODETEXT = 13; null-terminated UTF-16 buffer. `encode_utf16`
        // emits surrogate pairs for characters outside the BMP (e.g. emoji).
        let utf16: Vec<u16> = content.encode_utf16().chain(std::iter::once(0)).collect();
        let size = utf16.len() * 2;

        let h = match GlobalAlloc(GMEM_MOVEABLE, size) {
            Ok(h) => h,
            Err(_) => {
                let _ = CloseClipboard();
                return Err("无法分配剪贴板内存".to_string());
            }
        };

        let ptr = GlobalLock(h);
        if ptr.is_null() {
            let _ = GlobalFree(h);
            let _ = CloseClipboard();
            return Err("无法锁定剪贴板内存".to_string());
        }
        std::ptr::copy_nonoverlapping(utf16.as_ptr(), ptr as *mut u16, utf16.len());
        let _ = GlobalUnlock(h);

        if EmptyClipboard().is_err() {
            let _ = GlobalFree(h);
            let _ = CloseClipboard();
            return Err("无法清空剪贴板".to_string());
        }

        // On success the clipboard takes ownership of the handle; only free it
        // in the failure paths above.
        if SetClipboardData(13, HANDLE(h.0)).is_err() {
            let _ = GlobalFree(h);
            let _ = CloseClipboard();
            return Err("无法写入剪贴板".to_string());
        }

        let _ = CloseClipboard();
        Ok(())
    }
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
    use windows::Win32::Foundation::{GlobalFree, HANDLE};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

    // CF_DIB = 8. Not re-exported by the `windows` crate's DataExchange module
    // in this version, so the literal is used directly.
    const CF_DIB: u32 = 8;

    // Converted before touching the clipboard, so a malformed file leaves the
    // user's current clipboard contents alone instead of emptying them.
    let dib = crate::clipboard::image::bmp_to_dib(bmp)?;

    unsafe {
        if OpenClipboard(None).is_err() {
            return Err("无法打开剪贴板".to_string());
        }

        let h = match GlobalAlloc(GMEM_MOVEABLE, dib.len()) {
            Ok(h) => h,
            Err(_) => {
                let _ = CloseClipboard();
                return Err("无法分配剪贴板内存".to_string());
            }
        };

        let ptr = GlobalLock(h);
        if ptr.is_null() {
            let _ = GlobalFree(h);
            let _ = CloseClipboard();
            return Err("无法锁定剪贴板内存".to_string());
        }
        std::ptr::copy_nonoverlapping(dib.as_ptr(), ptr as *mut u8, dib.len());
        let _ = GlobalUnlock(h);

        if EmptyClipboard().is_err() {
            let _ = GlobalFree(h);
            let _ = CloseClipboard();
            return Err("无法清空剪贴板".to_string());
        }

        // On success the clipboard takes ownership of the handle; only free it
        // in the failure paths above.
        if SetClipboardData(CF_DIB, HANDLE(h.0)).is_err() {
            let _ = GlobalFree(h);
            let _ = CloseClipboard();
            return Err("无法写入剪贴板".to_string());
        }

        let _ = CloseClipboard();
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub fn write_clipboard_image(_bmp: &[u8]) -> Result<(), String> {
    Err("当前平台暂不支持写入剪贴板".to_string())
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    // The clipboard is a single global OS resource. Cargo runs tests on
    // parallel threads, so serialize the round-trip tests to avoid contention
    // (OpenClipboard / EmptyClipboard are per-process-global).
    static CLIPBOARD_LOCK: Mutex<()> = Mutex::new(());

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
