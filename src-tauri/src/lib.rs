mod clipboard;
mod commands;
mod shortcut;
mod storage;
mod tray;

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

            let stored_shortcut = db
                .get_setting(shortcut::manager::SHORTCUT_SETTING_KEY)
                .ok()
                .flatten()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| shortcut::manager::DEFAULT_SHORTCUT.to_string());

            app.manage(db);
            // Must exist before `register` — it records the live binding.
            app.manage(shortcut::manager::ActiveShortcut::default());

            // Restore the user's binding, falling back to the default. A taken
            // combination is a normal condition (`Alt+Space` is PowerToys Run's
            // default), so it is reported and degraded, never panicked on.
            let mut registered = match shortcut::manager::register(app.handle(), &stored_shortcut) {
                Ok(()) => true,
                Err(err) => {
                    eprintln!("[shortcut] 注册「{stored_shortcut}」失败：{err}");
                    if stored_shortcut != shortcut::manager::DEFAULT_SHORTCUT {
                        match shortcut::manager::register(
                            app.handle(),
                            shortcut::manager::DEFAULT_SHORTCUT,
                        ) {
                            Ok(()) => true,
                            Err(fallback_err) => {
                                eprintln!(
                                    "[shortcut] 默认快捷键 {} 也无法注册：{fallback_err}",
                                    shortcut::manager::DEFAULT_SHORTCUT
                                );
                                false
                            }
                        }
                    } else {
                        false
                    }
                }
            };

            // The tray is the primary way in now, so a dead shortcut is no
            // longer fatal — but surface the window once so it is obvious the
            // app started.
            match tray::create(app.handle()) {
                Ok(()) => {}
                Err(err) => {
                    eprintln!("[tray] 托盘图标创建失败：{err}");
                    registered = false;
                }
            }

            if !registered {
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
        .on_window_event(|window, event| {
            // Closing the window hides it instead of quitting, so the clipboard
            // watcher keeps running in the tray. "退出" in the tray menu is the
            // explicit way out.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
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
            commands::shortcut::set_shortcut,
            commands::shortcut::clear_shortcut,
            commands::autostart::get_autostart,
            commands::autostart::set_autostart,
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
