use crate::clipboard::image::thumbnail_name;
use crate::storage::{Database, PurgeOutcome};
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
    let dir = app.path().app_data_dir().map(|d| d.join("images")).ok();
    let outcome = purge_and_reclaim(&db, dir.as_deref())?;

    if outcome.rows > 0 {
        let _ = db.vacuum();
    }
    Ok(outcome.rows)
}

/// Purge soft-deleted rows and delete the image files nothing refers to any more.
///
/// **Every purge must go through here.** A purge that drops the rows but forgets
/// the files is precisely how `images/` grows without bound: the database looks
/// tidy while the directory quietly accumulates every screenshot ever copied.
/// There are three callers — the settings button, the startup pass, and the trim
/// that runs on each save — and they have to agree.
///
/// Deliberately takes plain arguments rather than Tauri state so it can be
/// tested without an app handle. Does **not** VACUUM: that rewrites the whole
/// database file, so it belongs on the rare paths (startup, an explicit purge),
/// not on the per-copy trim.
pub fn purge_and_reclaim(db: &Database, images_dir: Option<&Path>) -> Result<PurgeOutcome, String> {
    let outcome = db.purge_deleted().map_err(|e| e.to_string())?;

    if let Some(dir) = images_dir {
        // Best-effort: the rows are already gone, so a file that refuses to
        // delete (locked by an image viewer, say) must not turn the whole purge
        // into an error.
        remove_orphaned_images(dir, &outcome.orphaned_files);
    }

    Ok(outcome)
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
    use super::{purge_and_reclaim, remove_orphaned_images};
    use crate::storage::entries::ClipboardEntry;
    use crate::storage::Database;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// Keeps parallel tests from sharing a temp directory.
    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_dir(tag: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("aicc_purge_{tag}_{n}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// An image entry: bytes on disk, so it carries a `content_ref`.
    fn image_entry(id: &str, hash: &str) -> ClipboardEntry {
        ClipboardEntry {
            id: id.into(),
            content_hash: hash.into(),
            content_type: "image".into(),
            subtype: Some("bitmap".into()),
            content: None,
            content_preview: Some("图片 2×2".into()),
            content_storage: "file".into(),
            content_ref: Some(format!("{hash}.bmp")),
            content_size: 54,
            source_app: None,
            source_window: None,
            is_deleted: false,
            is_pinned: false,
            created_at: 1000,
            updated_at: 1000,
        }
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

    /// The end-to-end shape of the bug this function exists to prevent: purge
    /// the row, forget the file, and `images/` grows forever.
    #[test]
    fn test_purge_and_reclaim_deletes_the_orphaned_files() {
        let root = temp_dir("reclaim");
        let images = root.join("images");
        std::fs::create_dir_all(&images).unwrap();
        let db = Database::new(root).unwrap();

        db.save_entry(&image_entry("keep", "aaaa")).unwrap();
        db.save_entry(&image_entry("gone", "bbbb")).unwrap();
        db.delete_entry("gone").unwrap();

        for name in ["aaaa.bmp", "aaaa.thumb.bmp", "bbbb.bmp", "bbbb.thumb.bmp"] {
            std::fs::write(images.join(name), b"BM").unwrap();
        }

        let outcome = purge_and_reclaim(&db, Some(&images)).unwrap();

        assert_eq!(outcome.rows, 1);
        assert!(!images.join("bbbb.bmp").exists(), "orphaned bitmap removed");
        assert!(
            !images.join("bbbb.thumb.bmp").exists(),
            "orphaned thumbnail removed"
        );
        assert!(
            images.join("aaaa.bmp").exists(),
            "a live entry's bitmap must survive the purge"
        );
        assert!(images.join("aaaa.thumb.bmp").exists());
    }

    #[test]
    fn test_purge_and_reclaim_without_an_images_dir_still_purges_rows() {
        let root = temp_dir("no_dir");
        let db = Database::new(root).unwrap();
        db.save_entry(&image_entry("gone", "cccc")).unwrap();
        db.delete_entry("gone").unwrap();

        let outcome = purge_and_reclaim(&db, None).unwrap();

        assert_eq!(outcome.rows, 1, "rows are purged even with nowhere to clean");
        assert_eq!(
            outcome.orphaned_files,
            vec!["cccc.bmp".to_string()],
            "and still reported, so a caller that does know the directory can act"
        );
    }
}
