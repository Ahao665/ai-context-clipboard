import {
  flattenPaletteItems,
  handlePaletteKey,
  isBrowseMode,
  resolveSelectedItem,
} from '../src/lib/palette-actions';
import { PALETTE_COMMANDS } from '@ai-clipboard/core';
import type { ClipboardEntry, PaletteComposeResult, PaletteItem } from '@ai-clipboard/types';

function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

function entry(id: string): ClipboardEntry {
  return {
    id,
    content_hash: `h-${id}`,
    content_type: 'text',
    content: `content-${id}`,
    content_preview: `preview-${id}`,
    content_storage: 'inline',
    content_size: 0,
    is_deleted: false,
    created_at: 1,
    updated_at: 1,
  };
}

/** A composed result with one AI command group + one history group of two entries. */
function composedFixture(e1: ClipboardEntry, e2: ClipboardEntry): PaletteComposeResult {
  const command = PALETTE_COMMANDS[0];
  return {
    groups: [
      {
        kind: 'commands',
        title: 'AI 命令',
        items: [{ kind: 'command', command, score: 0.9 }],
      },
      {
        kind: 'history',
        title: '剪贴板历史',
        items: [
          { kind: 'entry', entry: e1, score: 0.8 },
          { kind: 'entry', entry: e2, score: 0.7 },
        ],
      },
    ],
    topEntry: e1,
  };
}

function test_empty_query_is_browse_mode() {
  assert(isBrowseMode('') === true, 'empty query → browse mode');
  assert(isBrowseMode('   ') === true, 'whitespace-only query → browse mode');
  assert(isBrowseMode('翻') === false, 'non-empty query → search mode');
}

function test_flatten_browse_returns_entries_in_order() {
  const e1 = entry('a');
  const e2 = entry('b');
  const flat = flattenPaletteItems(null, [e1, e2]);
  assert(flat.length === 2, 'browse flatten → 2 items');
  assert(flat[0].kind === 'entry' && flat[0].entry === e1, 'browse flatten[0] is e1');
  assert(flat[1].kind === 'entry' && flat[1].entry === e2, 'browse flatten[1] is e2');

  const sel = resolveSelectedItem(0, null, [e1, e2]);
  assert(sel?.kind === 'entry' && sel.entry === e1, 'browse resolveSelectedItem(0) is e1');
}

function test_search_grouping_flattens_commands_then_entries() {
  const e1 = entry('a');
  const e2 = entry('b');
  const result = composedFixture(e1, e2);
  const flat = flattenPaletteItems(result, [e1, e2]);
  assert(flat.length === 3, 'search flatten → 3 items');
  assert(flat[0].kind === 'command', 'search flatten[0] is a command');
  assert(flat[1].kind === 'entry' && flat[1].entry === e1, 'search flatten[1] is e1');
  assert(flat[2].kind === 'entry' && flat[2].entry === e2, 'search flatten[2] is e2');

  const s0 = resolveSelectedItem(0, result, [e1, e2]);
  const s1 = resolveSelectedItem(1, result, [e1, e2]);
  const s2 = resolveSelectedItem(2, result, [e1, e2]);
  assert(s0?.kind === 'command', 'resolveSelectedItem(0) → command');
  assert(s1?.kind === 'entry' && s1.entry === e1, 'resolveSelectedItem(1) → e1');
  assert(s2?.kind === 'entry' && s2.entry === e2, 'resolveSelectedItem(2) → e2');
}

function test_arrow_keys_move_selection() {
  const e1 = entry('a');
  const ctx = { query: '翻', selectedItem: null, topEntry: e1 };
  const down = handlePaletteKey('ArrowDown', false, ctx);
  assert(down.type === 'move' && down.delta === 1, 'ArrowDown → move +1');
  const up = handlePaletteKey('ArrowUp', false, ctx);
  assert(up.type === 'move' && up.delta === -1, 'ArrowUp → move -1');
}

function test_enter_on_entry_quick_pastes() {
  const e1 = entry('a');
  const selectedItem: PaletteItem = { kind: 'entry', entry: e1, score: 1 };
  const action = handlePaletteKey('Enter', false, { query: '', selectedItem, topEntry: null });
  assert(action.type === 'quickPaste', 'Enter on entry → quickPaste');
  if (action.type === 'quickPaste') {
    assert(action.entry === e1, 'quickPaste carries the selected entry');
  }
}

function test_shift_enter_on_entry_opens_detail() {
  const e1 = entry('a');
  const selectedItem: PaletteItem = { kind: 'entry', entry: e1, score: 1 };
  const action = handlePaletteKey('Enter', true, { query: '', selectedItem, topEntry: null });
  assert(action.type === 'openDetail', 'Shift+Enter on entry → openDetail');
  if (action.type === 'openDetail') {
    assert(action.id === e1.id, 'openDetail carries the entry id');
  }
}

function test_enter_on_command_runs_action() {
  const e1 = entry('a');
  const command = PALETTE_COMMANDS[0];
  const selectedItem: PaletteItem = { kind: 'command', command, score: 1 };
  const action = handlePaletteKey('Enter', false, { query: '总', selectedItem, topEntry: e1 });
  assert(action.type === 'runCommand', 'Enter on command → runCommand');
  if (action.type === 'runCommand') {
    assert(action.command === command, 'runCommand carries the command');
    assert(action.target === e1, 'runCommand targets the top entry');
  }
}

function test_escape_hides_in_browse_clears_in_search() {
  const browseAction = handlePaletteKey('Escape', false, {
    query: '',
    selectedItem: null,
    topEntry: null,
  });
  assert(browseAction.type === 'hide', 'Esc in browse → hide');

  const searchAction = handlePaletteKey('Escape', false, {
    query: '翻',
    selectedItem: null,
    topEntry: null,
  });
  assert(searchAction.type === 'clearQuery', 'Esc in search → clearQuery');
}

function test_ime_composition_suppresses_all_keys() {
  const e1 = entry('a');
  const selectedItem: PaletteItem = { kind: 'entry', entry: e1, score: 1 };
  const baseCtx = { query: '翻', selectedItem, topEntry: e1 };

  // Enter while composing (committing pinyin) must NOT quick-paste / run command.
  const enterComposing = handlePaletteKey('Enter', false, { ...baseCtx, isComposing: true });
  assert(enterComposing.type === 'none', 'Enter during IME composition → none');

  // Shift+Enter while composing must NOT open detail.
  const shiftEnterComposing = handlePaletteKey('Enter', true, { ...baseCtx, isComposing: true });
  assert(shiftEnterComposing.type === 'none', 'Shift+Enter during IME composition → none');

  // Escape while composing (canceling candidate selection) must NOT hide/clear.
  const escapeComposing = handlePaletteKey('Escape', false, { ...baseCtx, isComposing: true });
  assert(escapeComposing.type === 'none', 'Escape during IME composition → none');

  // Arrow keys during composition must NOT move selection.
  const arrowComposing = handlePaletteKey('ArrowDown', false, { ...baseCtx, isComposing: true });
  assert(arrowComposing.type === 'none', 'ArrowDown during IME composition → none');
}

async function main() {
  const tests = [
    test_empty_query_is_browse_mode,
    test_flatten_browse_returns_entries_in_order,
    test_search_grouping_flattens_commands_then_entries,
    test_arrow_keys_move_selection,
    test_enter_on_entry_quick_pastes,
    test_shift_enter_on_entry_opens_detail,
    test_enter_on_command_runs_action,
    test_escape_hides_in_browse_clears_in_search,
    test_ime_composition_suppresses_all_keys,
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
