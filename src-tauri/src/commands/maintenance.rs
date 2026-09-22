use crate::clipboard::image::thumbnail_name;
use crate::storage::Database;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

/// Number of live (non-deleted) clipboard entries.
#[tauri::command]
pub fn count_entries(db: State<'_, Database>) -> Result<i64, String> {
    db.count_entries().map_err(|e| e.to_string())
}

/// Soft-delete all live entries and purge the search index. Returns rows affected.
#[tauri::command]
pub fn clear_history(db: State<'_, Database>) -> Result<usize, String> {
    db.clear_history().map_err(|e| e.to_string())
}

/// Physically delete soft-deleted rows, reclaim their image files, and compact
/// the database. Returns rows purged.
#[tauri::command]
pub fn purge_deleted(app: AppHandle, db: State<'_, Database>) -> Result<usize, String> {
    let outcome = db.purge_deleted().map_err(|e| e.to_string())?;

    // Best-effort: the rows are already gone, so a file that refuses to delete
    // (locked by a viewer, say) must not turn the whole purge into an error.
    if let Ok(dir) = app.path().app_data_dir() {
        remove_orphaned_images(&dir.join("images"), &outcome.orphaned_files);
    }

    if outcome.rows > 0 {
        let _ = db.vacuum();
    }
    Ok(outcome.rows)
}

/// Delete each orphaned bitmap along with its thumbnail.
///
/// Missing files are not an error — an entry may predate image support, or the
/// directory may already have been cleaned up by hand.
fn remove_orphaned_images(images_dir: &Path, file_names: &[String]) {
    for name in file_names {
        for candidate in [name.clone(), thumbnail_name(name)] {
            match std::fs::remove_file(images_dir.join(&candidate)) {
                Ok(()) => {}
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
                Err(err) => eprintln!("[purge] 删除图片失败 {candidate}：{err}"),
            }
        }
    }
}

/// Trim history down to `max` newest entries. Returns rows trimmed.
#[tauri::command]
pub fn enforce_history_cap(db: State<'_, Database>, max: i64) -> Result<usize, String> {
    db.enforce_history_cap(max).map_err(|e| e.to_string())
}

/// Most recent live entry, or `None` when history is empty.
#[tauri::command]
pub fn latest_entry(
    db: State<'_, Database>,
) -> Result<Option<crate::storage::entries::ClipboardEntry>, String> {
    db.latest_entry().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::remove_orphaned_images;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("aicc_purge_{tag}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_removes_the_bitmap_and_its_thumbnail() {
        let dir = temp_dir("both");
        std::fs::write(dir.join("abc.bmp"), b"BM").unwrap();
        std::fs::write(dir.join("abc.thumb.bmp"), b"BM").unwrap();
        // An unrelated capture must survive.
        std::fs::write(dir.join("keep.bmp"), b"BM").unwrap();

        remove_orphaned_images(&dir, &["abc.bmp".to_string()]);

        assert!(!dir.join("abc.bmp").exists());
        assert!(!dir.join("abc.thumb.bmp").exists(), "thumbnail must go too");
        assert!(dir.join("keep.bmp").exists(), "other captures are untouched");
    }

    #[test]
    fn test_missing_files_are_not_an_error() {
        let dir = temp_dir("missing");
        // Nothing on disk at all — must not panic or bail out early, or the
        // remaining names in the list would be skipped.
        remove_orphaned_images(&dir, &["gone.bmp".to_string(), "also-gone.bmp".to_string()]);
    }

    #[test]
    fn test_one_unwritable_entry_does_not_stop_the_rest() {
        let dir = temp_dir("partial");
        std::fs::write(dir.join("second.bmp"), b"BM").unwrap();

        // The first name does not exist; the second must still be removed.
        remove_orphaned_images(&dir, &["first.bmp".to_string(), "second.bmp".to_string()]);

        assert!(!dir.join("second.bmp").exists());
    }
}
