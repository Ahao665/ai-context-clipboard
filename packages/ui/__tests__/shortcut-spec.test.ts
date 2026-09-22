import {
  buildShortcutSpec,
  codeToSpec,
  isModifierCode,
} from '../src/lib/shortcut-spec';
import type { ShortcutCaptureEvent } from '../src/lib/shortcut-spec';

function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

/** Keydown-shaped event with everything unset unless overridden. */
function key(partial: Partial<ShortcutCaptureEvent> & { code: string }): ShortcutCaptureEvent {
  return { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...partial };
}

function test_modifier_codes_are_recognised() {
  for (const code of ['ControlLeft', 'ControlRight', 'ShiftLeft', 'AltRight', 'MetaLeft']) {
    assert(isModifierCode(code), `${code} must count as a modifier`);
  }
  assert(!isModifierCode('KeyV'), 'a letter key is not a modifier');
  assert(!isModifierCode('Space'), 'space is not a modifier');
}

function test_letters_use_code_not_key() {
  // On AZERTY the key labelled A reports code KeyQ; the physical key is what
  // the OS registers, so `code` is the right source.
  assert(codeToSpec('KeyQ') === 'Q', 'KeyQ must map to Q');
  assert(codeToSpec('KeyA') === 'A', 'KeyA must map to A');
}

function test_digits_and_function_keys() {
  assert(codeToSpec('Digit1') === '1', 'Digit1 must map to 1');
  assert(codeToSpec('Digit0') === '0', 'Digit0 must map to 0');
  assert(codeToSpec('F1') === 'F1', 'F1 passes through');
  assert(codeToSpec('F24') === 'F24', 'F24 passes through');
  assert(codeToSpec('F25') === null, 'F25 does not exist');
}

function test_named_keys_pass_through() {
  for (const code of ['Space', 'Enter', 'Backslash', 'BracketLeft', 'Slash', 'ArrowUp']) {
    assert(codeToSpec(code) === code, `${code} should pass through unchanged`);
  }
}

function test_escape_and_unknown_keys_are_rejected() {
  // Escape cancels capture, so it must never become a binding.
  assert(codeToSpec('Escape') === null, 'Escape must not be bindable');
  assert(codeToSpec('MediaPlayPause') === null, 'media keys are not supported');
  assert(codeToSpec('') === null, 'empty code is not supported');
}

function test_build_simple_combo() {
  const result = buildShortcutSpec(key({ code: 'KeyV', ctrlKey: true, shiftKey: true }));
  assert(result.ok, 'Ctrl+Shift+V should be accepted');
  if (!result.ok) return;
  assert(result.spec === 'Ctrl+Shift+V', `unexpected spec: ${result.spec}`);
}

function test_modifier_order_is_canonical() {
  // Even if the user holds Shift first, the emitted spec is Ctrl+Alt+Shift+key.
  const result = buildShortcutSpec(
    key({ code: 'KeyV', ctrlKey: true, altKey: true, shiftKey: true }),
  );
  assert(result.ok, 'three modifiers should be accepted');
  if (!result.ok) return;
  assert(result.spec === 'Ctrl+Alt+Shift+V', `unexpected spec: ${result.spec}`);
}

function test_alt_space_is_expressible() {
  const result = buildShortcutSpec(key({ code: 'Space', altKey: true }));
  assert(result.ok, 'Alt+Space should be accepted');
  if (!result.ok) return;
  assert(result.spec === 'Alt+Space', `unexpected spec: ${result.spec}`);
}

function test_modifier_only_is_incomplete_not_an_error() {
  const result = buildShortcutSpec(key({ code: 'ControlLeft', ctrlKey: true }));
  assert(!result.ok, 'a modifier alone is not a binding');
  if (result.ok) return;
  assert(result.reason === 'modifier-only', `expected modifier-only, got ${result.reason}`);
  assert(result.message.length > 0, 'the hint must say what to do next');
}

function test_bare_key_is_rejected() {
  const result = buildShortcutSpec(key({ code: 'KeyA' }));
  assert(!result.ok, 'a bare letter would hijack normal typing');
  if (result.ok) return;
  assert(result.reason === 'no-modifier', `expected no-modifier, got ${result.reason}`);
}

function test_unsupported_key_is_reported() {
  const result = buildShortcutSpec(key({ code: 'MediaPlayPause', ctrlKey: true }));
  assert(!result.ok, 'unsupported keys must be rejected');
  if (result.ok) return;
  assert(result.reason === 'unsupported', `expected unsupported, got ${result.reason}`);
}

function test_super_is_supported() {
  const result = buildShortcutSpec(key({ code: 'KeyK', metaKey: true }));
  assert(result.ok, 'the Windows key should be usable as a modifier');
  if (!result.ok) return;
  assert(result.spec === 'Super+K', `unexpected spec: ${result.spec}`);
}

async function main() {
  const tests = [
    test_modifier_codes_are_recognised,
    test_letters_use_code_not_key,
    test_digits_and_function_keys,
    test_named_keys_pass_through,
    test_escape_and_unknown_keys_are_rejected,
    test_build_simple_combo,
    test_modifier_order_is_canonical,
    test_alt_space_is_expressible,
    test_modifier_only_is_incomplete_not_an_error,
    test_bare_key_is_rejected,
    test_unsupported_key_is_reported,
    test_super_is_supported,
  ];
  let passed = 0;
  let failed = 0;
  for (const test of tests) {
    try {
      await test();
      console.log(`✅ ${test.name} passed`);
      passed++;
    } catch (err) {
      console.error(`❌ ${test.name} failed:`, err);
      failed++;
    }
  }
  console.log(`\n---\nResults: ${passed}/${tests.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
