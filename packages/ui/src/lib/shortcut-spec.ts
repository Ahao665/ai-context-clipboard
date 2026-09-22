/**
 * Translate a keyboard event into the binding string the Rust side parses.
 *
 * The backend accepts `Code`-style names (`Ctrl+Shift+V`, `Alt+Space`,
 * `Ctrl+BracketLeft`) — see `global_hotkey`'s `parse_hotkey`. `KeyboardEvent.code`
 * is used rather than `.key` because it is layout-independent: on a French
 * AZERTY keyboard the key labelled A reports `code: 'KeyQ'`, and the OS
 * registers the physical key.
 */

/** `code` values for the modifier keys themselves. */
const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

/**
 * Non-alphanumeric keys the backend accepts, spelled exactly as `Code` expects.
 * `Escape` is deliberately absent — it cancels capture.
 */
const NAMED_CODES = new Set([
  'Backquote',
  'Backslash',
  'BracketLeft',
  'BracketRight',
  'Comma',
  'Period',
  'Quote',
  'Semicolon',
  'Slash',
  'Minus',
  'Equal',
  'Backspace',
  'CapsLock',
  'Enter',
  'Space',
  'Tab',
  'Delete',
  'End',
  'Home',
  'Insert',
  'PageDown',
  'PageUp',
  'PrintScreen',
  'ScrollLock',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'NumLock',
]);

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.has(code);
}

/** Map a `KeyboardEvent.code` to a backend key name, or `null` if unsupported. */
export function codeToSpec(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (NAMED_CODES.has(code)) return code;
  return null;
}

export interface ShortcutCaptureEvent {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export type ShortcutCaptureResult =
  | { ok: true; spec: string }
  | { ok: false; reason: 'modifier-only' | 'no-modifier' | 'unsupported'; message: string };

/**
 * Build a binding spec from a keydown event.
 *
 * A modifier-only press is reported as incomplete rather than as an error —
 * the user is mid-combination, not wrong.
 */
export function buildShortcutSpec(event: ShortcutCaptureEvent): ShortcutCaptureResult {
  if (isModifierCode(event.code)) {
    return { ok: false, reason: 'modifier-only', message: '继续按主键，例如 Ctrl+Shift+V' };
  }

  const key = codeToSpec(event.code);
  if (!key) {
    return { ok: false, reason: 'unsupported', message: '这个按键不能用作快捷键' };
  }

  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');

  if (parts.length === 0) {
    return {
      ok: false,
      reason: 'no-modifier',
      message: '需要至少一个修饰键（Ctrl / Alt / Shift），否则会抢占普通输入',
    };
  }

  return { ok: true, spec: [...parts, key].join('+') };
}
