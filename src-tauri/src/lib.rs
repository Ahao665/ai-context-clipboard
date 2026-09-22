mod clipboard;
mod commands;
mod shortcut;
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
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    shortcut::manager::handle_shortcut(app, shortcut, &event.state);
                })
                .build(),
        )
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            let db = Database::new(app_dir).expect("failed to initialize database");

            // Startup housekeeping: drop previously soft-deleted rows and trim
            // history to the configured cap. Best-effort — a failure here must
            // not stop the app from starting, so errors are intentionally ignored.
            let max_history: i64 = db
                .get_setting("ui.max_history")
                .ok()
                .flatten()
                .and_then(|v| v.parse().ok())
                .unwrap_or(500);
            let _ = db.purge_deleted();
            let _ = db.enforce_history_cap(max_history);

            app.manage(db);

            // The window starts hidden and there is no tray yet, so Alt+Space is
            // the only way in. If the binding is taken (PowerToys Run uses it by
            // default), show the window rather than leaving an unreachable
            // process behind — and never panic, which would look like the app
            // simply failing to launch.
            if let Err(err) = shortcut::manager::register_alt_space(app.handle()) {
                eprintln!("[shortcut] Alt+Space 注册失败，可能已被其他程序占用: {err}");
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

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
            commands::storage::toggle_pin,
            commands::storage::find_by_hash,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::clipboard::set_clipboard,
            commands::maintenance::count_entries,
            commands::maintenance::clear_history,
            commands::maintenance::purge_deleted,
            commands::maintenance::enforce_history_cap,
            commands::maintenance::latest_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
