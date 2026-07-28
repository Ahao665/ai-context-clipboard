use sha2::{Sha256, Digest};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ClipboardContent {
    pub text: Option<String>,
    pub content_hash: String,
}

impl ClipboardContent {
    pub fn new(text: Option<String>) -> Self {
        let content_hash = text
            .as_deref()
            .map(|t| {
                let mut hasher = Sha256::new();
                hasher.update(t.as_bytes());
                format!("{:x}", hasher.finalize())
            })
            .unwrap_or_default();

        Self { text, content_hash }
    }

    pub fn is_empty(&self) -> bool {
        self.text.as_deref().map_or(true, |t| t.is_empty())
    }
}

pub fn start_clipboard_watcher(tx: mpsc::Sender<ClipboardContent>) {
    thread::spawn(move || {
        let mut last_hash = String::new();
        loop {
            let content = get_clipboard_text();
            if !content.is_empty() && content.content_hash != last_hash {
                last_hash = content.content_hash.clone();
                let _ = tx.send(content);
            }
            thread::sleep(Duration::from_millis(500));
        }
    });
}

#[cfg(target_os = "windows")]
fn get_clipboard_text() -> ClipboardContent {
    unsafe {
        use windows::Win32::System::DataExchange::*;
        use windows::Win32::Foundation::*;
        use windows::Win32::System::Memory::*;

        if OpenClipboard(None).is_err() {
            return ClipboardContent::new(None);
        }

        let text = if let Ok(handle) = GetClipboardData(CF_UNICODETEXT.0 as u32) {
            if !handle.is_invalid() {
                let ptr = GlobalLock(handle);
                if let Ok(locked) = ptr {
                    if !locked.is_null() {
                        let ptr_u16 = locked as *const u16;
                        let len = (0..).take_while(|&i| *ptr_u16.add(i) != 0).count();
                        let slice = std::slice::from_raw_parts(ptr_u16, len);
                        let s = String::from_utf16_lossy(slice);
                        let _ = GlobalUnlock(handle);
                        Some(s)
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        let _ = CloseClipboard();
        ClipboardContent::new(text)
    }
}

#[cfg(not(target_os = "windows"))]
fn get_clipboard_text() -> ClipboardContent {
    ClipboardContent::new(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_content() {
        let content = ClipboardContent::new(None);
        assert!(content.is_empty());
        assert!(content.content_hash.is_empty());
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
}
