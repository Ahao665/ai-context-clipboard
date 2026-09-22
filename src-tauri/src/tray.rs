//! System tray icon.
//!
//! Without this the app is effectively invisible: the main window starts
//! hidden, so there was no way to tell whether it was running and no way to
//! quit it short of Task Manager.

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

const MENU_TOGGLE: &str = "tray.toggle";
const MENU_SETTINGS: &str = "tray.settings";
const MENU_QUIT: &str = "tray.quit";

/// Emitted to the webview so it can open the settings panel on demand.
const EVENT_OPEN_SETTINGS: &str = "app:open-settings";

/// Build the tray icon. Called once during app setup.
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItemBuilder::with_id(MENU_TOGGLE, "显示 / 隐藏面板").build(app)?;
    let settings = MenuItemBuilder::with_id(MENU_SETTINGS, "设置…").build(app)?;
    let quit = MenuItemBuilder::with_id(MENU_QUIT, "退出").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&toggle, &settings])
        .separator()
        .items(&[&quit])
        .build()?;

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("AI Context Clipboard")
        // Left click toggles the window; the menu is on right click only.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().0.as_str() {
            MENU_TOGGLE => toggle_window(app),
            MENU_SETTINGS => open_settings(app),
            MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window(tray.app_handle());
            }
        });

    // `to_owned` detaches the icon from the AppHandle borrow so the builder can
    // outlive it.
    if let Some(icon) = app.default_window_icon().cloned().map(|i| i.to_owned()) {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

fn toggle_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_settings(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.show();
    let _ = window.set_focus();
    // Best-effort: if the webview has not mounted its listener yet the window
    // is still shown, which is the important half.
    let _ = app.emit(EVENT_OPEN_SETTINGS, ());
}
