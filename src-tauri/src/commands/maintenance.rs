use crate::storage::Database;
use tauri::State;

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

/// Physically delete soft-deleted rows and reclaim disk space. Returns rows purged.
#[tauri::command]
pub fn purge_deleted(db: State<'_, Database>) -> Result<usize, String> {
    let purged = db.purge_deleted().map_err(|e| e.to_string())?;
    // Reclaiming space is best-effort; a failure here must not fail the purge,
    // since the rows are already gone.
    if purged > 0 {
        let _ = db.vacuum();
    }
    Ok(purged)
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
