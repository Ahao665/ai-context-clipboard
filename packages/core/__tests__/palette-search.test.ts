import { composePaletteResults } from '../src/palette/search';
import type { ClipboardEntry } from '@ai-clipboard/types';

function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

function entry(id: string, content: string, createdAt: number): ClipboardEntry {
  return {
    id,
    content_hash: `h-${id}`,
    content_type: 'text',
    content,
    content_preview: content,
    content_storage: 'inline',
    content_size: content.length,
    is_deleted: false,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function test_empty_query_no_commands_history_in_order() {
  const e1 = entry('e1', 'first', 2);
  const e2 = entry('e2', 'second', 1);
  const r = composePaletteResults('', [e1, e2]);

  const commandsGroup = r.groups.find((g) => g.kind === 'commands');
  assert(commandsGroup === undefined, 'empty query should produce NO commands group');

  const historyGroup = r.groups.find((g) => g.kind === 'history');
  assert(historyGroup !== undefined, 'history group should exist for empty query');
  assert(historyGroup!.items.length === 2, 'history group should contain all entries');
  assert(
    historyGroup!.items[0].kind === 'entry' && historyGroup!.items[0].entry.id === 'e1',
    'entry order should be preserved (e1 first)',
  );
  assert(
    historyGroup!.items[1].kind === 'entry' && historyGroup!.items[1].entry.id === 'e2',
    'entry order should be preserved (e2 second)',
  );
  assert(r.topEntry?.id === 'e1', 'topEntry should be the first entry');
  console.log('✅ test_empty_query_no_commands_history_in_order passed');
}

function test_ai_command_ranking_commands_first() {
  const r = composePaletteResults('翻', []);

  assert(r.groups.length > 0, 'should produce at least one group');
  assert(r.groups[0].kind === 'commands', 'commands group should come FIRST when query matches');

  const commandsGroup = r.groups.find((g) => g.kind === 'commands');
  assert(commandsGroup !== undefined, 'commands group should exist for query 翻');
  const labels = commandsGroup!.items.map((i) => (i.kind === 'command' ? i.command.label : ''));
  assert(labels.includes('翻译'), '翻译 should match query 翻');
  assert(!labels.includes('总结'), '总结 should NOT match query 翻');
  assert(r.topEntry === null, 'topEntry should be null when there are no entries');
  console.log('✅ test_ai_command_ranking_commands_first passed');
}

function test_clipboard_ranking_by_relevance() {
  const entries = [
    entry('e1', 'apple pie', 3),
    entry('e2', 'I love apple', 2),
    entry('e3', 'nothing here', 1),
  ];
  const r = composePaletteResults('apple', entries);

  const historyGroup = r.groups.find((g) => g.kind === 'history');
  assert(historyGroup !== undefined, 'history group should exist');

  const ids = historyGroup!.items.map((i) => (i.kind === 'entry' ? i.entry.id : ''));
  assert(ids.includes('e1') && ids.includes('e2'), 'both apple entries should be present');
  assert(!ids.includes('e3'), 'non-matching entry should be excluded');
  assert(ids[0] === 'e1' && ids[1] === 'e2', 'apple entries should be sorted best-first');
  assert(r.topEntry?.id === 'e1', 'topEntry should be the best match');
  console.log('✅ test_clipboard_ranking_by_relevance passed');
}

async function main() {
  const tests = [
    test_empty_query_no_commands_history_in_order,
    test_ai_command_ranking_commands_first,
    test_clipboard_ranking_by_relevance,
  ];
  let passed = 0;
  let failed = 0;
  for (const test of tests) {
    try {
      await test();
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
