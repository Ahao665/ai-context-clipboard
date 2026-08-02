import { fuzzyMatch } from '../src/palette/fuzzy';

// Node's console.assert does not throw, so assert also throws on failure
// to make the try/catch harness in main() count real failures.
function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

function test_empty_query() {
  const m = fuzzyMatch('', 'anything');
  assert(m !== null && m.score === 0, 'empty query matches with score 0');
  console.log('✅ test_empty_query passed');
}

function test_exact_prefix_high_score() {
  const a = fuzzyMatch('sum', 'summarize');
  const b = fuzzyMatch('sum', 'discuss summary');
  assert(a !== null && b !== null, 'both should match');
  assert(a!.score > b!.score, 'prefix match should score higher than later match');
  console.log('✅ test_exact_prefix_high_score passed');
}

function test_subsequence_match() {
  const m = fuzzyMatch('sma', 'summarize');
  assert(m !== null, 'subsequence should match');
  assert(m!.indices.length === 3, 'should track matched indices');
  console.log('✅ test_subsequence_match passed');
}

function test_case_insensitive() {
  const m = fuzzyMatch('SUM', 'summarize');
  assert(m !== null, 'matching should be case-insensitive');
  console.log('✅ test_case_insensitive passed');
}

function test_chinese_subsequence() {
  const m = fuzzyMatch('总', '总结');
  assert(m !== null, 'single Chinese char should match');
  const m2 = fuzzyMatch('润', '润色');
  assert(m2 !== null, 'Chinese subsequence should match');
  console.log('✅ test_chinese_subsequence passed');
}

function test_no_match_returns_null() {
  const m = fuzzyMatch('xyz', 'summarize');
  assert(m === null, 'non-subsequence should return null');
  console.log('✅ test_no_match_returns_null passed');
}

function test_consecutive_beats_scattered() {
  const a = fuzzyMatch('foo', 'afoox');
  const b = fuzzyMatch('foo', 'afxoo');
  assert(a !== null && b !== null, 'both should match');
  assert(a!.score > b!.score, 'consecutive chars should outscore scattered chars');
  console.log('✅ test_consecutive_beats_scattered passed');
}

async function main() {
  const tests = [
    test_empty_query,
    test_exact_prefix_high_score,
    test_subsequence_match,
    test_case_insensitive,
    test_chinese_subsequence,
    test_no_match_returns_null,
    test_consecutive_beats_scattered,
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
