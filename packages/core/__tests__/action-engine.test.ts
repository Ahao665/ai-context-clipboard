import { executeSummarize } from '../src/action-engine';
import { buildSummarizePrompt } from '../src/prompt-templates';
import { AIClient } from '../src/ai/client';
import type { AIResponse } from '@ai-clipboard/types';

function mockClient(response: AIResponse): AIClient {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }) as Response;
  return new AIClient({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
  });
}

function mockClientError(): AIClient {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }) as Response;
  return new AIClient({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
  });
}

// --- Test: prompt generation ---

function test_prompt_generation() {
  const prompt = buildSummarizePrompt('Hello world');
  console.assert(prompt.includes('Hello world'), 'prompt should contain input content');
  console.assert(prompt.includes('总结'), 'prompt should contain 总结 instruction');
  console.log('✅ test_prompt_generation passed');
}

function test_prompt_with_multiline() {
  const content = 'Line 1\nLine 2\nLine 3';
  const prompt = buildSummarizePrompt(content);
  console.assert(prompt.includes(content), 'prompt should preserve multiline content');
  console.log('✅ test_prompt_with_multiline passed');
}

// --- Test: action execution ---

async function test_summarize_success() {
  const client = mockClient({
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1700000000,
    model: 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: '- 要点1\n- 要点2\n- 要点3' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
  });

  const result = await executeSummarize(client, '这是一段需要总结的文字');
  console.assert(result.success === true, 'should succeed');
  console.assert(result.actionId === 'text.summarize', 'actionId should match');
  console.assert(result.content.includes('要点1'), 'should contain summarized points');
  console.assert(result.error === undefined, 'should have no error');
  console.log('✅ test_summarize_success passed');
}

async function test_summarize_empty_content() {
  const client = mockClient({
    id: '',
    object: 'chat.completion',
    created: 0,
    model: '',
    choices: [],
  });

  const result = await executeSummarize(client, '');
  console.assert(result.success === false, 'should fail with empty content');
  console.assert(result.error !== undefined, 'should have error message');
  console.log('✅ test_summarize_empty_content passed');
}

async function test_summarize_whitespace_content() {
  const client = mockClient({
    id: '',
    object: 'chat.completion',
    created: 0,
    model: '',
    choices: [],
  });

  const result = await executeSummarize(client, '   ');
  console.assert(result.success === false, 'should fail with whitespace-only content');
  console.log('✅ test_summarize_whitespace_content passed');
}

async function test_summarize_api_error() {
  const client = mockClientError();

  const result = await executeSummarize(client, 'Some content');
  console.assert(result.success === false, 'should fail on API error');
  console.assert(result.error !== undefined, 'should have error message');
  console.log('✅ test_summarize_api_error passed');
}

// --- Run all ---

async function main() {
  const tests = [
    test_prompt_generation,
    test_prompt_with_multiline,
    test_summarize_success,
    test_summarize_empty_content,
    test_summarize_whitespace_content,
    test_summarize_api_error,
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

  const total = passed + failed;
  console.log(`\n---\nResults: ${passed}/${total} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
