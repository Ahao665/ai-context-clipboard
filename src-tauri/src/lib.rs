mod clipboard;

use clipboard::ClipboardContent;
use std::sync::mpsc;
use tauri::Manager;

pub fn run() {
    let (tx, rx) = mpsc::channel::<ClipboardContent>();
    clipboard::start_clipboard_watcher(tx);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                while let Ok(content) = rx.recv() {
                    let _ = app_handle.emit("clipboard:changed", &content);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running application");
}
