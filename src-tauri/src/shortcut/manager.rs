use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Register the Alt+Space shortcut during app setup.
///
/// Returns an error instead of panicking when the binding is unavailable.
/// `Alt+Space` is a popular choice — PowerToys Run uses it by default, and
/// Windows itself opens the window menu with it — so `RegisterHotKey` can
/// legitimately fail on a machine where this app is otherwise perfectly usable.
/// The caller decides how to degrade; see `run()` in `lib.rs`.
pub fn register_alt_space(app: &tauri::AppHandle) -> Result<(), String> {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    app.global_shortcut()
        .register(shortcut)
        .map_err(|err| err.to_string())
}

/// Toggle the main window visibility.
fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// Handle a pressed shortcut event — returns true if handled.
pub fn handle_shortcut(app: &tauri::AppHandle, shortcut: &Shortcut, event: &ShortcutState) -> bool {
    if *event == ShortcutState::Pressed && shortcut.matches(Modifiers::ALT, Code::Space) {
        toggle_window(app);
        true
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

    #[test]
    fn test_shortcut_creation() {
        let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
        assert!(shortcut.matches(Modifiers::ALT, Code::Space));
        assert!(!shortcut.matches(Modifiers::ALT, Code::KeyA));
        assert!(!shortcut.matches(Modifiers::CONTROL, Code::Space));
    }

    #[test]
    fn test_shortcut_to_string() {
        let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
        let display = shortcut.to_string();
        assert!(!display.is_empty());
    }

    #[test]
    fn test_shortcut_without_modifiers() {
        let alt_space = Shortcut::new(Some(Modifiers::ALT), Code::Space);
        let plain_space = Shortcut::new(None, Code::Space);
        assert!(!plain_space.matches(Modifiers::ALT, Code::Space));
        assert!(alt_space.matches(Modifiers::ALT, Code::Space));
    }
}
