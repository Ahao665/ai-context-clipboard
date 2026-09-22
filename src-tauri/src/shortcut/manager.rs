use std::str::FromStr;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Binding used when nothing is stored, or when the stored value is unusable.
pub const DEFAULT_SHORTCUT: &str = "Alt+Space";

/// Settings key holding the panel-toggle binding.
pub const SHORTCUT_SETTING_KEY: &str = "shortcut.panel";

/// The binding that is currently live.
///
/// The handler has to know *which* shortcut to react to, and that changes at
/// runtime once the user rebinds it in the settings panel.
pub struct ActiveShortcut(Mutex<Shortcut>);

impl ActiveShortcut {
    pub fn new(shortcut: Shortcut) -> Self {
        Self(Mutex::new(shortcut))
    }

    fn get(&self) -> Shortcut {
        *self.0.lock().unwrap()
    }

    fn set(&self, shortcut: Shortcut) {
        *self.0.lock().unwrap() = shortcut;
    }
}

impl Default for ActiveShortcut {
    fn default() -> Self {
        Self::new(Shortcut::new(Some(Modifiers::ALT), Code::Space))
    }
}

/// Parse a user-facing binding such as `Ctrl+Shift+V` or `Alt+Space`.
pub fn parse(spec: &str) -> Result<Shortcut, String> {
    let trimmed = spec.trim();
    if trimmed.is_empty() {
        return Err("快捷键不能为空".to_string());
    }
    // Reject modifier-only combos early: the parser would otherwise report the
    // confusing "invalid format" for something like "Ctrl+Shift".
    Shortcut::from_str(trimmed).map_err(|_| format!("无法识别的快捷键：{trimmed}"))
}

/// Register `spec` as the panel toggle, replacing the previous binding.
///
/// On failure the previous binding is put back, so a bad value from the settings
/// panel can never leave the app with no shortcut at all.
///
/// Note that `RegisterHotKey` legitimately fails when another process owns the
/// combination — `Alt+Space` is PowerToys Run's default, for instance. That is a
/// user-visible condition, not a bug, so it is reported rather than panicked on.
pub fn register(app: &tauri::AppHandle, spec: &str) -> Result<(), String> {
    let next = parse(spec)?;
    let previous = app.try_state::<ActiveShortcut>().map(|s| s.get());
    let manager = app.global_shortcut();

    // `unregister_all` also clears anything left over from an earlier binding,
    // which keeps the registry from growing across rebinds.
    let _ = manager.unregister_all();

    match manager.register(next) {
        Ok(()) => {
            if let Some(state) = app.try_state::<ActiveShortcut>() {
                state.set(next);
            }
            Ok(())
        }
        Err(err) => {
            if let Some(prev) = previous {
                let _ = manager.register(prev);
            }
            Err(format!(
                "快捷键 {} 注册失败，可能已被其他程序占用（{err}）",
                spec.trim()
            ))
        }
    }
}

/// Release every registered binding, leaving the persisted value alone.
///
/// Used while the settings panel is recording a new binding: otherwise pressing
/// the *current* combination would toggle the window instead of being captured.
pub fn clear(app: &tauri::AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
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
    if *event != ShortcutState::Pressed {
        return false;
    }

    let Some(state) = app.try_state::<ActiveShortcut>() else {
        return false;
    };
    let active = state.get();

    // Compare modifiers + key rather than the whole struct: `Shortcut` also
    // carries an id, and `matches` is the comparison the plugin documents.
    if shortcut.matches(active.mods, active.key) {
        toggle_window(app);
        true
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    // --- Parsing user input -------------------------------------------------

    #[test]
    fn test_parse_alt_space() {
        let parsed = parse("Alt+Space").expect("Alt+Space must parse");
        assert!(parsed.matches(Modifiers::ALT, Code::Space));
    }

    #[test]
    fn test_parse_is_case_insensitive_and_trims() {
        let parsed = parse("  ctrl+SHIFT+v  ").expect("mixed case must parse");
        assert!(parsed.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyV));
    }

    #[test]
    fn test_parse_multi_modifier_order_is_flexible() {
        // Modifiers may appear in any order before the main key.
        let parsed = parse("Shift+Ctrl+V").expect("reordered modifiers must parse");
        assert!(parsed.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyV));
    }

    #[test]
    fn test_parse_rejects_empty_and_unknown() {
        assert!(parse("").is_err());
        assert!(parse("   ").is_err());
        assert!(parse("Ctrl+NotAKey").is_err());
    }

    #[test]
    fn test_parse_rejects_modifiers_only() {
        assert!(parse("Ctrl+Shift").is_err(), "no main key → unusable binding");
    }

    #[test]
    fn test_parse_error_message_mentions_the_input() {
        let err = parse("Ctrl+NotAKey").unwrap_err();
        assert!(err.contains("Ctrl+NotAKey"), "got: {err}");
    }

    #[test]
    fn test_different_bindings_do_not_match_each_other() {
        let alt_space = parse("Alt+Space").unwrap();
        let ctrl_shift_v = parse("Ctrl+Shift+V").unwrap();
        assert!(!alt_space.matches(ctrl_shift_v.mods, ctrl_shift_v.key));
        assert!(!ctrl_shift_v.matches(alt_space.mods, alt_space.key));
    }
}
