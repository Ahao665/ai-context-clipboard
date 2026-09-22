//! Serve captured bitmaps to the webview, and put them back on the clipboard.

use crate::clipboard::image::{base64_encode, thumbnail_name};
use crate::clipboard::writer::write_clipboard_image;
use crate::storage::Database;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

/// Where an entry's bitmap lives: the images directory plus its file name.
struct StoredImage {
    dir: PathBuf,
    file_name: String,
}

impl StoredImage {
    fn path(&self, file_name: &str) -> PathBuf {
        self.dir.join(file_name)
    }

    fn thumbnail_name(&self) -> String {
        thumbnail_name(&self.file_name)
    }
}

/// Return an entry's image as a `data:` URL, or `None` when it has none.
///
/// `thumbnail` selects the small companion written at capture time, which is
/// what list rows ask for. Storing both means neither request has to decode or
/// rescale anything while the panel is rendering.
#[tauri::command]
pub fn get_entry_image(
    app: AppHandle,
    db: State<'_, Database>,
    id: String,
    thumbnail: bool,
) -> Result<Option<String>, String> {
    let Some(stored) = stored_image(&app, &db, &id)? else {
        return Ok(None);
    };

    let path = if thumbnail {
        stored.path(&stored.thumbnail_name())
    } else {
        stored.path(&stored.file_name)
    };

    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(format!(
            "data:image/bmp;base64,{}",
            base64_encode(&bytes)
        ))),
        // A missing file is not worth surfacing: the entry may predate image
        // support, or the file may have been cleaned up. The row shows a
        // placeholder instead.
        Err(_) => Ok(None),
    }
}

/// Put an entry's bitmap back on the system clipboard (Quick Paste).
#[tauri::command]
pub fn set_clipboard_image(
    app: AppHandle,
    db: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    let Some(stored) = stored_image(&app, &db, &id)? else {
        return Err("这条记录没有可复制的图片".to_string());
    };

    let bytes = std::fs::read(stored.path(&stored.file_name))
        .map_err(|_| "图片文件已不存在".to_string())?;
    write_clipboard_image(&bytes)
}

/// Locate an entry's bitmap, or `None` when the entry has none.
///
/// The file name comes from the stored entry, never from the caller — `id` is
/// only a lookup key, so there is no path for anyone to traverse.
fn stored_image(
    app: &AppHandle,
    db: &Database,
    id: &str,
) -> Result<Option<StoredImage>, String> {
    let Some(entry) = db.get_entry(id).map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let Some(file_name) = entry.content_ref else {
        return Ok(None);
    };

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("images");

    Ok(Some(StoredImage { dir, file_name }))
}
