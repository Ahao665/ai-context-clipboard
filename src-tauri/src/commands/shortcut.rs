use crate::shortcut::manager;
use crate::storage::Database;
use tauri::{AppHandle, State};

/// Rebind the panel-toggle shortcut.
///
/// Order matters: the new value is persisted *first*, then applied at runtime.
/// If `RegisterHotKey` refuses it (another program owns the combination) the
/// persisted value is rolled back, so what is stored always matches what is
/// actually live.
#[tauri::command]
pub fn set_shortcut(
    app: AppHandle,
    db: State<'_, Database>,
    shortcut: String,
) -> Result<String, String> {
    let spec = shortcut.trim().to_string();
    let previous = db.get_setting(manager::SHORTCUT_SETTING_KEY).ok().flatten();

    db.set_setting(manager::SHORTCUT_SETTING_KEY, &spec)
        .map_err(|e| e.to_string())?;

    if let Err(err) = manager::register(&app, &spec) {
        let restore = previous.as_deref().unwrap_or(manager::DEFAULT_SHORTCUT);
        let _ = db.set_setting(manager::SHORTCUT_SETTING_KEY, restore);
        return Err(err);
    }

    Ok(spec)
}

/// Release the panel shortcut without changing what is stored.
///
/// Called while the settings panel records a new binding, so that pressing the
/// current combination is captured by the panel instead of toggling the window.
#[tauri::command]
pub fn clear_shortcut(app: AppHandle) -> Result<(), String> {
    manager::clear(&app)
}
