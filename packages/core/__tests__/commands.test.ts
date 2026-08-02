import { PALETTE_COMMANDS } from '../src/palette/commands';
import { fuzzyMatch } from '../src/palette/fuzzy';

// The exact set of valid ActionId values (mirrors packages/types/src/actions.ts).
const VALID_ACTION_IDS = [
  'text.summarize',
  'text.translate',
  'text.polish',
  'text.reply',
  'text.explain',
  'code.explain',
  'code.debug',
] as const;

function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

function test_exactly_five_commands() {
  assert(PALETTE_COMMANDS.length === 5, `expected exactly 5 commands, got ${PALETTE_COMMANDS.length}`);
  console.log('✅ test_exactly_five_commands passed');
}

function test_command_fields_and_categories() {
  for (const c of PALETTE_COMMANDS) {
    assert(typeof c.id === 'string' && c.id.length > 0, `id should be non-empty for ${c.label}`);
    assert(
      (VALID_ACTION_IDS as readonly string[]).includes(c.actionId),
      `actionId ${c.actionId} must be a valid ActionId`,
    );
    assert(typeof c.label === 'string' && c.label.length > 0, `label should be non-empty for ${c.id}`);
    assert(typeof c.description === 'string' && c.description.length > 0, `description should be non-empty for ${c.id}`);
    assert(Array.isArray(c.keywords) && c.keywords.length > 0, `keywords should be non-empty for ${c.id}`);
    assert(c.category === 'AI', `category should be 'AI' for ${c.id}, got ${c.category}`);
  }
  console.log('✅ test_command_fields_and_categories passed');
}

function test_translate_pinyin_keyword() {
  const translate = PALETTE_COMMANDS.find((c) => c.id === 'translate');
  assert(translate !== undefined, 'translate command should exist');
  const haystack = `${translate!.label} ${translate!.keywords.join(' ')}`;
  assert(fuzzyMatch('fanyi', haystack) !== null, 'pinyin "fanyi" should match translate command');
  console.log('✅ test_translate_pinyin_keyword passed');
}

function test_summarize_pinyin_keyword() {
  const summarize = PALETTE_COMMANDS.find((c) => c.id === 'summarize');
  assert(summarize !== undefined, 'summarize command should exist');
  const haystack = `${summarize!.label} ${summarize!.keywords.join(' ')}`;
  assert(fuzzyMatch('zj', haystack) !== null, 'pinyin "zj" should match summarize command');
  console.log('✅ test_summarize_pinyin_keyword passed');
}

function test_chinese_label_keyword() {
  const reply = PALETTE_COMMANDS.find((c) => c.id === 'reply');
  assert(reply !== undefined, 'reply command should exist');
  const haystack = `${reply!.label} ${reply!.keywords.join(' ')}`;
  assert(fuzzyMatch('回复', haystack) !== null, 'Chinese label 回复 should match reply command');
  console.log('✅ test_chinese_label_keyword passed');
}

async function main() {
  const tests = [
    test_exactly_five_commands,
    test_command_fields_and_categories,
    test_translate_pinyin_keyword,
    test_summarize_pinyin_keyword,
    test_chinese_label_keyword,
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
