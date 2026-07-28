mod clipboard;
mod commands;
mod storage;

use clipboard::ClipboardContent;
use storage::Database;
use std::sync::mpsc;
use tauri::Emitter;
use tauri::Manager;

pub fn run() {
    let (tx, rx) = mpsc::channel::<ClipboardContent>();
    clipboard::start_clipboard_watcher(tx);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            let db = Database::new(app_dir).expect("failed to initialize database");
            app.manage(db);

            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                while let Ok(content) = rx.recv() {
                    let _ = app_handle.emit("clipboard:changed", &content);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::storage::save_entry,
            commands::storage::list_entries,
            commands::storage::search_entries,
            commands::storage::delete_entry,
            commands::storage::find_by_hash,
            commands::settings::get_setting,
            commands::settings::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
