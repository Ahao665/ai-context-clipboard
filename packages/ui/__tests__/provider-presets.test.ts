import {
  PROVIDER_PRESETS,
  matchPreset,
  validateAIConfig,
  isConfigUsable,
} from '../src/lib/provider-presets';
import type { AIProviderConfig } from '@ai-clipboard/types';

function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

function config(partial: Partial<AIProviderConfig>): AIProviderConfig {
  return { baseUrl: '', apiKey: '', model: '', ...partial };
}

function test_every_preset_has_unique_id() {
  const ids = PROVIDER_PRESETS.map((p) => p.id);
  const unique = new Set(ids);
  assert(unique.size === ids.length, 'provider preset ids must be unique');
  assert(ids.includes('custom'), 'a "custom" preset must exist as the fallback');
}

function test_non_custom_presets_are_complete() {
  for (const preset of PROVIDER_PRESETS) {
    if (preset.id === 'custom') continue;
    assert(preset.baseUrl.startsWith('https://'), `${preset.id}: baseUrl should be https`);
    assert(preset.model.length > 0, `${preset.id}: model must be set`);
    assert(preset.label.length > 0, `${preset.id}: label must be set`);
  }
}

function test_match_preset_exact() {
  const deepseek = PROVIDER_PRESETS.find((p) => p.id === 'deepseek')!;
  const id = matchPreset(config({ baseUrl: deepseek.baseUrl, model: deepseek.model }));
  assert(id === 'deepseek', `exact baseUrl should match deepseek, got ${id}`);
}

function test_match_preset_ignores_trailing_slash() {
  const id = matchPreset(config({ baseUrl: 'https://api.deepseek.com/v1/' }));
  assert(id === 'deepseek', `trailing slash should still match, got ${id}`);
}

function test_match_preset_falls_back_to_custom() {
  const id = matchPreset(config({ baseUrl: 'https://my.internal.llm/v1' }));
  assert(id === 'custom', `unknown baseUrl should map to custom, got ${id}`);
}

function test_match_preset_empty_is_custom() {
  assert(matchPreset(config({ baseUrl: '' })) === 'custom', 'empty baseUrl → custom');
}

function test_validate_rejects_missing_base_url() {
  const errors = validateAIConfig(config({ baseUrl: '', model: 'gpt-4o-mini' }));
  assert(errors.length > 0, 'missing baseUrl must be an error');
  assert(errors.some((e) => e.includes('API 地址')), 'error should mention API 地址');
}

function test_validate_rejects_scheme_less_url() {
  const errors = validateAIConfig(config({ baseUrl: 'api.deepseek.com', model: 'x' }));
  assert(errors.some((e) => e.includes('http')), 'scheme-less url must be rejected');
}

function test_validate_rejects_missing_model() {
  const errors = validateAIConfig(config({ baseUrl: 'https://api.deepseek.com/v1', model: '' }));
  assert(errors.some((e) => e.includes('模型')), 'missing model must be an error');
}

function test_validate_accepts_valid_config() {
  const errors = validateAIConfig(
    config({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }),
  );
  assert(errors.length === 0, `valid config should produce no errors, got ${errors.join(', ')}`);
}

function test_validate_allows_blank_api_key() {
  // A saved config may legitimately have no key yet — that is a usability warning,
  // not a validation error, so the panel can still render it.
  const errors = validateAIConfig(
    config({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '' }),
  );
  assert(errors.length === 0, 'blank apiKey should not be a hard validation error');
}

function test_is_config_usable_requires_key() {
  const noKey = config({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' });
  assert(!isConfigUsable(noKey), 'config without a key is not usable');

  const withKey = config({
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: 'sk-abc',
  });
  assert(isConfigUsable(withKey), 'config with url+model+key is usable');
}

function test_is_config_usable_rejects_whitespace_key() {
  const blank = config({
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: '   ',
  });
  assert(!isConfigUsable(blank), 'whitespace-only key is not usable');
}

async function main() {
  const tests = [
    test_every_preset_has_unique_id,
    test_non_custom_presets_are_complete,
    test_match_preset_exact,
    test_match_preset_ignores_trailing_slash,
    test_match_preset_falls_back_to_custom,
    test_match_preset_empty_is_custom,
    test_validate_rejects_missing_base_url,
    test_validate_rejects_scheme_less_url,
    test_validate_rejects_missing_model,
    test_validate_accepts_valid_config,
    test_validate_allows_blank_api_key,
    test_is_config_usable_requires_key,
    test_is_config_usable_rejects_whitespace_key,
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
