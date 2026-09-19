import {
  createRemotePaletteComposer,
  SEARCH_LIMIT,
  type SearchFn,
} from '../src/lib/palette-compose';
import type { ClipboardEntry, ContentType } from '@ai-clipboard/types';

function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

function entry(
  id: string,
  content: string,
  createdAt: number,
  contentType: ContentType = 'text',
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

/** Records calls so we can assert on what the composer asked the backend for. */
function spySearch(result: ClipboardEntry[], impl?: SearchFn) {
  const calls: Array<{ query: string; limit: number; offset: number; contentType?: ContentType }> = [];
  const fn: SearchFn = async (query, limit, offset, contentType) => {
    calls.push({ query, limit, offset, contentType });
    if (impl) return impl(query, limit, offset, contentType);
    return result;
  };
  return { fn, calls };
}

async function test_browse_mode_skips_backend() {
  const { fn, calls } = spySearch([]);
  const compose = createRemotePaletteComposer(fn, () => null);

  const result = await compose('', [entry('a', 'one', 2), entry('b', 'two', 1)]);

  assert(calls.length === 0, 'browse mode must not hit the backend');
  assert(result.groups.length === 1, 'one history group');
  assert(result.groups[0].items.length === 2, 'all in-memory entries listed');
  assert(result.topEntry?.id === 'a', 'newest first');
}

async function test_browse_mode_honours_type_filter() {
  const { fn } = spySearch([]);
  const compose = createRemotePaletteComposer(fn, () => 'url');

  const result = await compose('', [
    entry('a', 'plain', 3, 'text'),
    entry('b', 'https://example.com', 2, 'url'),
  ]);

  const items = result.groups[0]?.items ?? [];
  assert(items.length === 1, 'only the url entry should remain');
  assert(items[0].kind === 'entry' && items[0].entry.id === 'b', 'the url entry');
}

async function test_search_calls_backend_with_query_and_limit() {
  const { fn, calls } = spySearch([entry('found', 'matching text', 5)]);
  const compose = createRemotePaletteComposer(fn, () => null);

  await compose('matching', []);

  assert(calls.length === 1, 'exactly one backend call');
  assert(calls[0].query === 'matching', `query forwarded, got ${calls[0].query}`);
  assert(calls[0].limit === SEARCH_LIMIT, 'limit forwarded');
  assert(calls[0].offset === 0, 'starts at offset 0');
  assert(calls[0].contentType === undefined, 'no filter → undefined');
}

async function test_search_forwards_type_filter() {
  const { fn, calls } = spySearch([]);
  const compose = createRemotePaletteComposer(fn, () => 'code');

  await compose('fn', []);

  assert(calls[0].contentType === 'code', `filter forwarded, got ${calls[0].contentType}`);
}

async function test_search_trims_query_before_calling() {
  const { fn, calls } = spySearch([]);
  const compose = createRemotePaletteComposer(fn, () => null);

  await compose('  spaced  ', []);

  assert(calls[0].query === 'spaced', `query should be trimmed, got "${calls[0].query}"`);
}

async function test_whitespace_query_is_browse_mode() {
  const { fn, calls } = spySearch([]);
  const compose = createRemotePaletteComposer(fn, () => null);

  const result = await compose('   ', [entry('a', 'x', 1)]);

  assert(calls.length === 0, 'whitespace-only query must not hit the backend');
  assert(result.groups[0]?.items.length === 1, 'browse behaviour applies');
}

async function test_backend_results_are_ranked_locally() {
  // Backend returns recency order; the composer should re-rank by relevance.
  const { fn } = spySearch([
    entry('buried', 'a long paragraph that only mentions needle near the very end here', 100),
    entry('exact', 'needle', 50),
  ]);
  const compose = createRemotePaletteComposer(fn, () => null);

  const result = await compose('needle', []);

  const items = result.groups.find((g) => g.kind === 'history')?.items ?? [];
  assert(items.length === 2, 'both backend hits kept');
  assert(
    items[0].kind === 'entry' && items[0].entry.id === 'exact',
    'relevance should outrank the backend recency order',
  );
}

async function test_search_includes_commands_group() {
  // The backend hit must actually contain the query, otherwise the local
  // relevance pass legitimately drops it (see the drop test below).
  const { fn } = spySearch([entry('a', '总结这段内容', 1)]);
  const compose = createRemotePaletteComposer(fn, () => null);

  const result = await compose('总结', []);

  assert(result.groups[0]?.kind === 'commands', 'commands group comes first');
  assert(result.groups.length === 2, 'commands + history');
}

async function test_backend_hits_without_local_match_are_dropped() {
  // The FTS index can return rows the local matcher does not consider relevant
  // (e.g. a type-filtered hit). Those must not be shown as if they matched.
  const { fn } = spySearch([entry('irrelevant', 'completely different text', 1)]);
  const compose = createRemotePaletteComposer(fn, () => null);

  const result = await compose('apple', []);

  const historyItems = result.groups.find((g) => g.kind === 'history')?.items ?? [];
  assert(historyItems.length === 0, 'non-matching backend hit must be filtered out');
}

async function test_backend_failure_degrades_to_local_scan() {
  const failing: SearchFn = async () => {
    throw new Error('index unavailable');
  };
  const compose = createRemotePaletteComposer(failing, () => null);

  const result = await compose('apple', [
    entry('a', 'apple pie', 2),
    entry('b', 'banana bread', 1),
  ]);

  const items = result.groups.find((g) => g.kind === 'history')?.items ?? [];
  assert(items.length === 1, 'local fallback should still find the match');
  assert(
    items[0].kind === 'entry' && items[0].entry.id === 'a',
    'fallback returns the matching entry',
  );
}

async function test_backend_failure_fallback_is_case_insensitive() {
  const failing: SearchFn = async () => {
    throw new Error('boom');
  };
  const compose = createRemotePaletteComposer(failing, () => null);

  const result = await compose('APPLE', [entry('a', 'apple pie', 1)]);

  const items = result.groups.find((g) => g.kind === 'history')?.items ?? [];
  assert(items.length === 1, 'case-insensitive fallback match');
}

async function test_backend_failure_fallback_respects_type_filter() {
  const failing: SearchFn = async () => {
    throw new Error('boom');
  };
  const compose = createRemotePaletteComposer(failing, () => 'url');

  const result = await compose('example', [
    entry('text1', 'example text', 2, 'text'),
    entry('url1', 'https://example.com', 1, 'url'),
  ]);

  const items = result.groups.find((g) => g.kind === 'history')?.items ?? [];
  assert(items.length === 1, 'fallback must apply the type filter');
  assert(items[0].kind === 'entry' && items[0].entry.id === 'url1', 'only the url entry');
}

async function test_no_results_yields_empty_result() {
  const { fn } = spySearch([]);
  const compose = createRemotePaletteComposer(fn, () => null);

  const result = await compose('nomatch', []);

  assert(result.groups.length === 0, 'no groups when nothing matches');
  assert(result.topEntry === null, 'no target');
}

async function test_top_entry_is_first_history_match() {
  const { fn } = spySearch([entry('first', 'target text', 1), entry('second', 'target other', 2)]);
  const compose = createRemotePaletteComposer(fn, () => null);

  const result = await compose('target', []);

  const historyItems = result.groups.find((g) => g.kind === 'history')?.items ?? [];
  const expected = historyItems[0];
  assert(
    expected.kind === 'entry' && result.topEntry?.id === expected.entry.id,
    'topEntry must be the highest-ranked history item (AI command target)',
  );
}

async function main() {
  const tests = [
    test_browse_mode_skips_backend,
    test_browse_mode_honours_type_filter,
    test_search_calls_backend_with_query_and_limit,
    test_search_forwards_type_filter,
    test_search_trims_query_before_calling,
    test_whitespace_query_is_browse_mode,
    test_backend_results_are_ranked_locally,
    test_search_includes_commands_group,
    test_backend_hits_without_local_match_are_dropped,
    test_backend_failure_degrades_to_local_scan,
    test_backend_failure_fallback_is_case_insensitive,
    test_backend_failure_fallback_respects_type_filter,
    test_no_results_yields_empty_result,
    test_top_entry_is_first_history_match,
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
