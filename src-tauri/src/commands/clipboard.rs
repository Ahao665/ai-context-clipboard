use crate::clipboard::writer::write_clipboard_text;

/// Writes `content` back to the Windows system clipboard (Quick Paste).
///
/// Errors are sanitized in `write_clipboard_text`; the clipboard content is
/// never included in error strings or logs.
#[tauri::command]
pub fn set_clipboard(content: String) -> Result<(), String> {
    write_clipboard_text(&content)
}
