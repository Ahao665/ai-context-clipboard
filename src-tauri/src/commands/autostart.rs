//! Opt-in "start with Windows" support.
//!
//! Written directly against the per-user `Run` key rather than pulling in an
//! autostart plugin: the project is Windows-only and already calls Win32 for the
//! clipboard, so this keeps the dependency list — and therefore the installer
//! size — unchanged, and the single registry write the app performs stays
//! visible in one place.
//!
//! `HKCU` is deliberate. It needs no elevation, and it is the same entry Task
//! Manager's "启动" tab shows and can switch off — so a user who removes it there
//! is not fighting the app.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
use windows::Win32::System::Registry::{
    RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
    HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_SAM_FLAGS, REG_SZ,
};

/// Per-user startup list. The `HKLM` equivalent would require elevation.
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

/// Value name, matching the product name so the entry is recognisable in Task
/// Manager's startup tab.
const RUN_VALUE: &str = "AI Context Clipboard";

/// NUL-terminated UTF-16 — what every `...W` API here expects.
fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// Little-endian bytes of the wide string, terminator included.
///
/// `REG_SZ` is UTF-16 on the wire, so this is a real conversion rather than a
/// reinterpret cast of the `Vec<u16>`.
fn wide_bytes(value: &str) -> Vec<u8> {
    wide(value).into_iter().flat_map(u16::to_le_bytes).collect()
}

/// The command line to store in the `Run` value.
///
/// Quoted: the install path contains spaces (`C:\Program Files\…`), and an
/// unquoted path with spaces is how Windows ends up launching the wrong binary.
fn launch_command() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| format!("取不到程序路径：{e}"))?;
    Ok(format!("\"{}\"", exe.display()))
}

fn open_run_key(access: REG_SAM_FLAGS) -> Result<HKEY, String> {
    let subkey = wide(RUN_KEY);
    // `HKEY` is a raw pointer wrapper with no `Default`, so it starts null.
    let mut key = HKEY(std::ptr::null_mut());
    let rc = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey.as_ptr()),
            0,
            access,
            &mut key,
        )
    };
    if rc == ERROR_SUCCESS {
        Ok(key)
    } else {
        Err(format!("打开注册表启动项失败（错误码 {}）", rc.0))
    }
}

/// Whether our `Run` entry currently exists.
fn entry_exists() -> bool {
    let Ok(key) = open_run_key(KEY_QUERY_VALUE) else {
        return false;
    };
    let name = wide(RUN_VALUE);
    // A null data pointer with a size out-param is the documented way to ask
    // "does this value exist, and how big is it".
    let mut size = 0u32;
    let rc = unsafe {
        RegQueryValueExW(
            key,
            PCWSTR(name.as_ptr()),
            None,
            None,
            None,
            Some(&mut size),
        )
    };
    let _ = unsafe { RegCloseKey(key) };
    rc == ERROR_SUCCESS
}

fn write_entry() -> Result<(), String> {
    let key = open_run_key(KEY_SET_VALUE)?;
    let name = wide(RUN_VALUE);
    let data = wide_bytes(&launch_command()?);
    let rc = unsafe { RegSetValueExW(key, PCWSTR(name.as_ptr()), 0, REG_SZ, Some(&data)) };
    let _ = unsafe { RegCloseKey(key) };
    if rc == ERROR_SUCCESS {
        Ok(())
    } else {
        Err(format!("写入注册表失败（错误码 {}）", rc.0))
    }
}

fn remove_entry() -> Result<(), String> {
    let key = open_run_key(KEY_SET_VALUE)?;
    let name = wide(RUN_VALUE);
    let rc = unsafe { RegDeleteValueW(key, PCWSTR(name.as_ptr())) };
    let _ = unsafe { RegCloseKey(key) };

    // Already absent is a success as far as the caller is concerned — turning
    // off something that is off should not be an error.
    if rc == ERROR_SUCCESS || rc == ERROR_FILE_NOT_FOUND {
        Ok(())
    } else {
        Err(format!("删除注册表项失败（错误码 {}）", rc.0))
    }
}

/// Whether the app is currently registered to start with Windows.
///
/// Read from the registry rather than from our own settings table on purpose:
/// the user can switch the entry off from Task Manager's startup tab at any
/// time, and a stored flag would then disagree with reality.
#[tauri::command]
pub fn get_autostart() -> bool {
    entry_exists()
}

/// Turn "start with Windows" on or off, and report the resulting state.
///
/// Returns what the registry says *after* the change instead of echoing the
/// requested value, so a refused write (a locked key, or a policy that blocks
/// `Run` entries) surfaces as a mismatch rather than as a toggle that silently
/// did nothing.
#[tauri::command]
pub fn set_autostart(enabled: bool) -> Result<bool, String> {
    if enabled {
        write_entry()?;
    } else {
        remove_entry()?;
    }
    Ok(entry_exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wide_is_nul_terminated() {
        assert_eq!(wide("ab"), vec![0x61, 0x62, 0x00]);
    }

    #[test]
    fn test_wide_bytes_is_two_bytes_per_unit_including_terminator() {
        // "abc" -> 4 units -> 8 bytes.
        assert_eq!(wide_bytes("abc").len(), 8);
        assert_eq!(wide_bytes("").len(), 2);
    }

    #[test]
    fn test_wide_bytes_is_little_endian() {
        assert_eq!(wide_bytes("A"), vec![0x41, 0x00, 0x00, 0x00]);
    }

    #[test]
    fn test_launch_command_is_quoted() {
        let cmd = launch_command().expect("current_exe resolves under cargo test");
        assert!(cmd.starts_with('"') && cmd.ends_with('"'), "got {cmd}");
    }

    #[test]
    fn test_run_value_name_matches_product_name() {
        assert_eq!(RUN_VALUE, "AI Context Clipboard");
    }

    #[test]
    fn test_run_key_is_the_per_user_startup_list() {
        // HKCU, not HKLM: no elevation, and Task Manager can toggle it.
        assert_eq!(RUN_KEY, r"Software\Microsoft\Windows\CurrentVersion\Run");
    }
}
