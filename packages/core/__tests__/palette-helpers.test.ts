import {
  buildPaletteResult,
  composePaletteResults,
  filterByType,
  matchCommands,
  orderEntries,
  rankEntriesByQuery,
} from '../src/palette/search';
import type { ClipboardEntry } from '@ai-clipboard/types';

function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

function entry(
  id: string,
  content: string,
  createdAt: number,
  contentType: ClipboardEntry['content_type'] = 'text',
): ClipboardEntry {
  return {
    id,
    content_hash: `h-${id}`,
    content_type: contentType,
    content,
    content_preview: content,
    content_storage: 'inline',
    content_size: content.length,
    is_deleted: false,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

// --- matchCommands --------------------------------------------------------

function test_match_commands_empty_query_is_empty() {
  assert(matchCommands('').length === 0, 'empty query must offer no commands');
  assert(matchCommands('   ').length === 0, 'whitespace query must offer no commands');
}

function test_match_commands_matches_chinese_label() {
  const items = matchCommands('总结');
  assert(items.length >= 1, '「总结」 should match at least one command');
  assert(
    items.every((i) => i.kind === 'command'),
    'matchCommands must only return command items',
  );
  const first = items[0];
  assert(
    first.kind === 'command' && first.command.actionId === 'text.summarize',
    '「总结」 should rank summarize first',
  );
}

function test_match_commands_matches_english_keyword() {
  const items = matchCommands('translate');
  assert(items.length >= 1, 'english keyword should match');
  const first = items[0];
  assert(
    first.kind === 'command' && first.command.actionId === 'text.translate',
    'translate should rank the translate command first',
  );
}

function test_match_commands_no_match_returns_empty() {
  assert(matchCommands('zzzzzz').length === 0, 'nonsense query matches nothing');
}

// --- orderEntries ---------------------------------------------------------

function test_order_entries_preserves_input_order() {
  const items = orderEntries([entry('a', 'first', 3), entry('b', 'second', 1)]);
  assert(items.length === 2, 'both entries returned');
  assert(
    items[0].kind === 'entry' && items[0].entry.id === 'a',
    'browse order must follow the input (newest first)',
  );
  assert(items[0].score > items[1].score, 'earlier entries score higher');
}

// --- rankEntriesByQuery ---------------------------------------------------

function test_rank_entries_orders_by_relevance() {
  const items = rankEntriesByQuery('rust', [
    entry('weak', 'a paragraph that mentions rust once at the very end of a long sentence', 1),
    entry('strong', 'rust', 2),
  ]);
  assert(items.length === 2, 'both should match');
  assert(
    items[0].kind === 'entry' && items[0].entry.id === 'strong',
    'exact/short match should outrank a buried one',
  );
}

function test_rank_entries_drops_non_matches() {
  const items = rankEntriesByQuery('zzz', [entry('a', 'nothing here', 1)]);
  assert(items.length === 0, 'non-matching entries are dropped');
}

function test_rank_entries_empty_query_preserves_order() {
  const items = rankEntriesByQuery('', [entry('a', 'one', 2), entry('b', 'two', 1)]);
  assert(items.length === 2, 'empty query keeps everything');
  assert(items[0].kind === 'entry' && items[0].entry.id === 'a', 'order preserved');
}

function test_rank_entries_uses_recency_as_tiebreak() {
  // Identical content → identical score, so the incoming order must decide.
  const items = rankEntriesByQuery('same', [
    entry('newer', 'same', 100),
    entry('older', 'same', 50),
  ]);
  assert(
    items[0].kind === 'entry' && items[0].entry.id === 'newer',
    'tie must fall back to the incoming (recency) order',
  );
}

// --- filterByType ---------------------------------------------------------

function test_filter_by_type_null_is_noop() {
  const entries = [entry('a', 'x', 1), entry('b', 'y', 2, 'url')];
  assert(filterByType(entries, null).length === 2, 'null filter keeps everything');
}

function test_filter_by_type_keeps_matching_only() {
  const entries = [
    entry('a', 'x', 1, 'text'),
    entry('b', 'https://x.com', 2, 'url'),
    entry('c', 'y', 3, 'code'),
  ];
  const urls = filterByType(entries, 'url');
  assert(urls.length === 1 && urls[0].id === 'b', 'only the url entry remains');
}

function test_filter_by_type_no_matches_is_empty() {
  assert(filterByType([entry('a', 'x', 1, 'text')], 'json').length === 0, 'no json → empty');
}

// --- buildPaletteResult ---------------------------------------------------

function test_build_result_omits_empty_groups() {
  const only = buildPaletteResult([], orderEntries([entry('a', 'x', 1)]));
  assert(only.groups.length === 1, 'only the history group should exist');
  assert(only.groups[0].kind === 'history', 'and it should be history');
  assert(only.topEntry?.id === 'a', 'topEntry is the first history item');
}

function test_build_result_both_groups_commands_first() {
  const result = buildPaletteResult(matchCommands('总结'), orderEntries([entry('a', 'x', 1)]));
  assert(result.groups.length === 2, 'both groups present');
  assert(result.groups[0].kind === 'commands', 'commands group comes first');
  assert(result.groups[1].kind === 'history', 'history group second');
}

function test_build_result_no_entries_has_null_top_entry() {
  const result = buildPaletteResult(matchCommands('总结'), []);
  assert(result.topEntry === null, 'no entries → topEntry is null');
  assert(result.groups.length === 1, 'commands group only');
}

function test_build_result_empty_inputs_is_empty() {
  const result = buildPaletteResult([], []);
  assert(result.groups.length === 0, 'nothing to show');
  assert(result.topEntry === null, 'no target');
}

// --- composePaletteResults (regression: behaviour preserved) --------------

function test_compose_browse_mode_matches_order_entries() {
  const entries = [entry('a', 'one', 2), entry('b', 'two', 1)];
  const result = composePaletteResults('', entries);
  assert(result.groups.length === 1, 'browse mode has only history');
  assert(result.groups[0].items.length === 2, 'all entries listed');
}

function test_compose_search_matches_helpers() {
  const entries = [entry('a', 'apple pie', 2), entry('b', 'banana', 1)];
  const viaCompose = composePaletteResults('apple', entries);
  const viaHelpers = buildPaletteResult(
    matchCommands('apple'),
    rankEntriesByQuery('apple', entries),
  );
  assert(
    JSON.stringify(viaCompose) === JSON.stringify(viaHelpers),
    'composePaletteResults must equal the composed helpers (no drift)',
  );
}

function main() {
  const tests = [
    test_match_commands_empty_query_is_empty,
    test_match_commands_matches_chinese_label,
    test_match_commands_matches_english_keyword,
    test_match_commands_no_match_returns_empty,
    test_order_entries_preserves_input_order,
    test_rank_entries_orders_by_relevance,
    test_rank_entries_drops_non_matches,
    test_rank_entries_empty_query_preserves_order,
    test_rank_entries_uses_recency_as_tiebreak,
    test_filter_by_type_null_is_noop,
    test_filter_by_type_keeps_matching_only,
    test_filter_by_type_no_matches_is_empty,
    test_build_result_omits_empty_groups,
    test_build_result_both_groups_commands_first,
    test_build_result_no_entries_has_null_top_entry,
    test_build_result_empty_inputs_is_empty,
    test_compose_browse_mode_matches_order_entries,
    test_compose_search_matches_helpers,
  ];
  let passed = 0;
  let failed = 0;
  for (const test of tests) {
    try {
      test();
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
