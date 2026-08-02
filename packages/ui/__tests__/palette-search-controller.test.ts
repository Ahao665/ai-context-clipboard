import { createPaletteSearchController } from '../src/hooks/palette-search-controller';
import type { PaletteComposeResult } from '@ai-clipboard/types';

function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const emptyResult: PaletteComposeResult = { groups: [], topEntry: null };

async function test_debounce_fires_once_with_latest_query() {
  const composed: string[] = [];
  const applied: string[] = [];
  const controller = createPaletteSearchController((query: string) => {
    composed.push(query);
    return emptyResult;
  }, 150);

  controller.schedule('a', [], { onResult: () => applied.push('a') });
  await sleep(30);
  controller.schedule('b', [], { onResult: () => applied.push('b') });
  await sleep(30);
  controller.schedule('c', [], { onResult: () => applied.push('c') });
  await sleep(250);

  assert(composed.length === 1, 'debounce: compose should run once for rapid schedules');
  assert(composed[0] === 'c', 'debounce: compose should receive the last query');
  assert(applied.length === 1, 'debounce: onResult should fire once');
  assert(applied[0] === 'c', 'debounce: onResult should carry the last query');
}

async function test_stale_response_is_dropped_by_sequence_guard() {
  const applied: string[] = [];
  const controller = createPaletteSearchController(async (query: string) => {
    if (query === 'slow') await sleep(60);
    return emptyResult;
  }, 0);

  controller.schedule('slow', [], { onResult: () => applied.push('slow') });
  await sleep(20); // slow compose is now in-flight (debounce delay 0 → fired immediately)
  controller.schedule('fast', [], { onResult: () => applied.push('fast') });
  await sleep(150);

  assert(applied.length === 1, 'sequence guard: only the newest result is applied');
  assert(applied[0] === 'fast', 'sequence guard: stale slow result was dropped');
}

async function main() {
  const tests = [test_debounce_fires_once_with_latest_query, test_stale_response_is_dropped_by_sequence_guard];
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
