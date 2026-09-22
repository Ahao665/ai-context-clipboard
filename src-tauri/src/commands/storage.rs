use crate::commands::maintenance::purge_and_reclaim;
use crate::storage::entries::ClipboardEntry;
use crate::storage::Database;
use tauri::{AppHandle, Manager, State};

/// Default cap when `ui.max_history` is unset or unparseable.
const DEFAULT_MAX_HISTORY: i64 = 500;

#[tauri::command]
pub fn save_entry(
    app: AppHandle,
    db: State<'_, Database>,
    entry: ClipboardEntry,
) -> Result<(), String> {
    db.save_entry(&entry).map_err(|e| e.to_string())?;

    // Keep the table — and the images directory — bounded as entries arrive.
    // Best-effort: a failure here must not fail the save, since the entry itself
    // was persisted fine.
    let max_history = db
        .get_setting("ui.max_history")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(DEFAULT_MAX_HISTORY);

    // The purge only runs when the cap actually bit, which is at most once per
    // copy. Doing it here rather than only at startup is what stops a
    // long-running instance from accumulating every screenshot since it launched:
    // trimming alone only soft-deletes, so without this the "cap" bounds the
    // visible list while the disk keeps growing.
    if db.enforce_history_cap(max_history).unwrap_or(0) > 0 {
        let dir = app.path().app_data_dir().map(|d| d.join("images")).ok();
        let _ = purge_and_reclaim(&db, dir.as_deref());
    }

    Ok(())
}

#[tauri::command]
pub fn list_entries(
    db: State<'_, Database>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ClipboardEntry>, String> {
    db.list_entries(limit.unwrap_or(50), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_entries(
    db: State<'_, Database>,
    query: String,
    limit: Option<i64>,
    offset: Option<i64>,
    content_type: Option<String>,
) -> Result<Vec<ClipboardEntry>, String> {
    db.search_entries(&query, limit.unwrap_or(50), offset.unwrap_or(0), content_type.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_entry(db: State<'_, Database>, id: String) -> Result<(), String> {
    db.delete_entry(&id).map_err(|e| e.to_string())
}

/// Flip an entry's pinned state. Returns the new state so the UI can stay in sync.
#[tauri::command]
pub fn toggle_pin(db: State<'_, Database>, id: String) -> Result<bool, String> {
    db.toggle_pin(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn find_by_hash(
    db: State<'_, Database>,
    hash: String,
) -> Result<Option<ClipboardEntry>, String> {
    db.find_by_hash(&hash).map_err(|e| e.to_string())
}
