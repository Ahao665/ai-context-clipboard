use crate::storage::entries::ClipboardEntry;
use crate::storage::Database;
use tauri::State;

/// Default cap when `ui.max_history` is unset or unparseable.
const DEFAULT_MAX_HISTORY: i64 = 500;

#[tauri::command]
pub fn save_entry(db: State<'_, Database>, entry: ClipboardEntry) -> Result<(), String> {
    db.save_entry(&entry).map_err(|e| e.to_string())?;

    // Keep the table bounded as entries arrive. Trimming is best-effort: a failure
    // here must not fail the save, since the entry itself was persisted fine.
    let max_history = db
        .get_setting("ui.max_history")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(DEFAULT_MAX_HISTORY);
    let _ = db.enforce_history_cap(max_history);

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

#[tauri::command]
pub fn find_by_hash(
    db: State<'_, Database>,
    hash: String,
) -> Result<Option<ClipboardEntry>, String> {
    db.find_by_hash(&hash).map_err(|e| e.to_string())
}
