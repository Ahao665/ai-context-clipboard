import { useClipboardStore } from '../src/stores/clipboard-store';
import { PALETTE_COMMANDS } from '@ai-clipboard/core';
import type { ClipboardEntry, PaletteComposeResult } from '@ai-clipboard/types';

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

/** Reset the module-level singleton store to a pristine state between tests. */
function resetStore(): void {
  useClipboardStore.setState({
    entries: [],
    loading: false,
    selectedIndex: 0,
    selectedId: null,
    query: '',
    searchResults: null,
    isSearching: false,
    paletteNonce: 0,
  });
}

function test_move_selection_cycles_over_entries() {
  resetStore();
  useClipboardStore.getState().setEntries([entry('a'), entry('b'), entry('c')]);

  let s = useClipboardStore.getState();
  assert(s.searchResults === null, 'browse view: searchResults should be null');
  assert(s.selectedIndex === 0, 'selectedIndex should start at 0');
  assert(s.selectedId === 'a', 'selectedId should sync to the first entry');

  useClipboardStore.getState().moveSelection(1);
  s = useClipboardStore.getState();
  assert(s.selectedIndex === 1 && s.selectedId === 'b', 'move +1 → index 1 / id b');

  useClipboardStore.getState().moveSelection(1);
  s = useClipboardStore.getState();
  assert(s.selectedIndex === 2 && s.selectedId === 'c', 'move +1 → index 2 / id c');

  useClipboardStore.getState().moveSelection(1);
  s = useClipboardStore.getState();
  assert(s.selectedIndex === 0 && s.selectedId === 'a', 'move +1 wraps → index 0 / id a');

  useClipboardStore.getState().moveSelection(-1);
  s = useClipboardStore.getState();
  assert(s.selectedIndex === 2 && s.selectedId === 'c', 'move -1 wraps back → index 2 / id c');
}

function test_selection_clamps_when_entries_shrink() {
  resetStore();
  useClipboardStore.getState().setEntries([entry('a'), entry('b')]);
  useClipboardStore.getState().moveSelection(1);

  let s = useClipboardStore.getState();
  assert(s.selectedIndex === 1 && s.selectedId === 'b', 'move to index 1 / id b');

  useClipboardStore.getState().setEntries([entry('x')]);
  s = useClipboardStore.getState();
  assert(s.selectedIndex === 0, 'selectedIndex clamps to 0 when entries shrink');
  assert(s.selectedId === 'x', 'selectedId re-syncs to the surviving entry');
}

function test_reset_palette_resets_search_state_and_bumps_nonce() {
  resetStore();
  const before = useClipboardStore.getState().paletteNonce;

  useClipboardStore.getState().setQuery('翻');
  useClipboardStore.getState().setIsSearching(true);
  useClipboardStore.setState({
    searchResults: { groups: [], topEntry: null },
    selectedIndex: 2,
    selectedId: 'b',
  });

  useClipboardStore.getState().resetPalette();
  const s = useClipboardStore.getState();
  assert(s.query === '', 'resetPalette clears query');
  assert(s.searchResults === null, 'resetPalette clears searchResults');
  assert(s.isSearching === false, 'resetPalette clears isSearching');
  assert(s.selectedIndex === 0, 'resetPalette resets selectedIndex to 0');
  assert(s.selectedId === null, 'resetPalette clears selectedId');
  assert(s.paletteNonce === before + 1, 'resetPalette bumps paletteNonce');
}

function test_set_results_cycles_over_flattened_items() {
  resetStore();
  const a = entry('a');
  const b = entry('b');
  const command = PALETTE_COMMANDS[0];
  const result: PaletteComposeResult = {
    groups: [
      { kind: 'commands', title: 'AI 命令', items: [{ kind: 'command', command, score: 1 }] },
      {
        kind: 'history',
        title: '剪贴板历史',
        items: [
          { kind: 'entry', entry: a, score: 1 },
          { kind: 'entry', entry: b, score: 1 },
        ],
      },
    ],
    topEntry: a,
  };

  useClipboardStore.getState().setEntries([a, b]);
  useClipboardStore.getState().setResults(result);

  let s = useClipboardStore.getState();
  assert(s.searchResults === result, 'setResults stores the composed result');
  assert(s.selectedIndex === 0, 'selection starts at the first flattened item');
  assert(s.selectedId === null, 'selectedId is null on a command item');

  useClipboardStore.getState().moveSelection(1);
  s = useClipboardStore.getState();
  assert(s.selectedIndex === 1 && s.selectedId === 'a', 'move +1 → entry a');

  useClipboardStore.getState().moveSelection(1);
  s = useClipboardStore.getState();
  assert(s.selectedIndex === 2 && s.selectedId === 'b', 'move +1 → entry b');

  useClipboardStore.getState().moveSelection(1);
  s = useClipboardStore.getState();
  assert(s.selectedIndex === 0 && s.selectedId === null, 'move +1 wraps back to the command item');
}

async function main() {
  const tests = [
    test_move_selection_cycles_over_entries,
    test_selection_clamps_when_entries_shrink,
    test_reset_palette_resets_search_state_and_bumps_nonce,
    test_set_results_cycles_over_flattened_items,
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
