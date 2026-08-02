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
        assert_eq!(read.text.as_deref(), Some(text));
    }

    #[test]
    fn unicode_roundtrip() {
        let _guard = CLIPBOARD_LOCK.lock().unwrap();
        let text = "你好，世界! 🚀 测试";
        super::write_clipboard_text(text).expect("write should succeed");
        let read = crate::clipboard::watcher::get_clipboard_text();
        assert_eq!(read.text.as_deref(), Some(text));
    }

    #[test]
    fn empty_string() {
        let _guard = CLIPBOARD_LOCK.lock().unwrap();
        super::write_clipboard_text("").expect("empty write should succeed");
        let read = crate::clipboard::watcher::get_clipboard_text();
        assert_eq!(read.text.as_deref(), Some(""));
    }
}
