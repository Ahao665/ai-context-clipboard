import { AIClient } from '../src/ai/client';

import {
  executeSummarize,
  buildSummarizePrompt,
} from '../src/actions/summarize';

/**
 * Throwing assertion.
 *
 * `console.assert` only logs on failure and returns normally, so a test built on
 * it can never fail — it reports green no matter what. Everything here must use
 * this helper instead.
 */
function assert(condition: unknown, message: string): void {
  console.assert(condition, message);
  if (!condition) throw new Error(message);
}

import {
  executeTranslate,
  buildTranslatePrompt,
} from '../src/actions/translate';
import { executeRewrite, buildRewritePrompt } from '../src/actions/rewrite';
import { executeReply, buildReplyPrompt } from '../src/actions/reply';
import { executeExplain, buildExplainPrompt } from '../src/actions/explain';

function testClient(): AIClient {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1700000000,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'AI response content' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ) as Response;
  return new AIClient({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
  });
}

function errorClient(): AIClient {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: 'API error' } }),
      {
        status: 429,
        headers: { 'content-type': 'application/json' },
      },
    ) as Response;
  return new AIClient({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
  });
}

// --- Prompt tests ---

function test_summarize_prompt() {
  const p = buildSummarizePrompt('hello');
  assert(p.includes('总结'), 'summarize: should contain 总结');
  assert(p.includes('hello'), 'summarize: should contain input');
  assert(p.includes('分点列出'), 'summarize: should ask for bullet points');
  console.log('✅ test_summarize_prompt passed');
}

function test_translate_prompt() {
  const p = buildTranslatePrompt('hello');
  assert(p.includes('翻译'), 'translate: should contain 翻译');
  assert(p.includes('hello'), 'translate: should contain input');
  console.log('✅ test_translate_prompt passed');
}

function test_rewrite_prompt() {
  const p = buildRewritePrompt('hello');
  assert(p.includes('润色') || p.includes('改进'), 'rewrite: should contain 改进');
  assert(p.includes('hello'), 'rewrite: should contain input');
  console.log('✅ test_rewrite_prompt passed');
}

function test_reply_prompt() {
  const p = buildReplyPrompt('hello');
  assert(p.includes('回复'), 'reply: should contain 回复');
  assert(p.includes('hello'), 'reply: should contain input');
  console.log('✅ test_reply_prompt passed');
}

function test_explain_prompt() {
  const p = buildExplainPrompt('hello');
  assert(p.includes('解释'), 'explain: should contain 解释');
  assert(p.includes('hello'), 'explain: should contain input');
  assert(p.includes('简单'), 'explain: should ask for simple language');
  console.log('✅ test_explain_prompt passed');
}

// --- Execution tests ---

async function test_summarize_success() {
  const result = await executeSummarize(testClient(), 'some text');
  assert(result.success === true, 'summarize should succeed');
  assert(result.actionId === 'text.summarize', 'actionId should match');
  console.log('✅ test_summarize_success passed');
}

async function test_translate_success() {
  const result = await executeTranslate(testClient(), 'some text');
  assert(result.success === true, 'translate should succeed');
  assert(result.actionId === 'text.translate', 'actionId should match');
  console.log('✅ test_translate_success passed');
}

async function test_rewrite_success() {
  const result = await executeRewrite(testClient(), 'some text');
  assert(result.success === true, 'rewrite should succeed');
  assert(result.actionId === 'text.polish', 'actionId should match');
  console.log('✅ test_rewrite_success passed');
}

async function test_reply_success() {
  const result = await executeReply(testClient(), 'some text');
  assert(result.success === true, 'reply should succeed');
  assert(result.actionId === 'text.reply', 'actionId should match');
  console.log('✅ test_reply_success passed');
}

async function test_explain_success() {
  const result = await executeExplain(testClient(), 'some text');
  assert(result.success === true, 'explain should succeed');
  assert(result.actionId === 'text.explain', 'actionId should match');
  console.log('✅ test_explain_success passed');
}

async function test_empty_content() {
  const r1 = await executeSummarize(testClient(), '');
  assert(r1.success === false, 'empty summarize should fail');
  const r2 = await executeTranslate(testClient(), '   ');
  assert(r2.success === false, 'whitespace translate should fail');
  const r3 = await executeRewrite(testClient(), '');
  assert(r3.success === false, 'empty rewrite should fail');
  const r4 = await executeReply(testClient(), '');
  assert(r4.success === false, 'empty reply should fail');
  const r5 = await executeExplain(testClient(), '');
  assert(r5.success === false, 'empty explain should fail');
  console.log('✅ test_empty_content passed');
}

async function test_api_error() {
  const result = await executeSummarize(errorClient(), 'text');
  assert(result.success === false, 'should fail on API error');
  assert(result.error !== undefined, 'should have error message');
  assert(typeof result.error === 'string', 'error should be a string');
  console.log('✅ test_api_error passed');
}

async function test_empty_api_result() {
  // API returns valid response but with empty content
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: 'chatcmpl-test', object: 'chat.completion', created: 1700000000, model: 'gpt-4o-mini',
        choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ) as Response;

  const client = new AIClient({
    baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini',
  });

  const result = await executeSummarize(client, 'some text');
  assert(result.success === false, 'empty API result should fail');
  assert(result.error!.includes('未返回'), 'should mention empty result');
  console.log('✅ test_empty_api_result passed');
}

async function test_content_too_long() {
  const longContent = 'x'.repeat(60_000); // exceeds 50k limit

  const client = new AIClient({
    baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini',
  });

  const result = await executeSummarize(client, longContent);
  assert(result.success === false, 'too-long content should fail');
  assert(result.error!.includes('过长'), 'should mention length limit');
  console.log('✅ test_content_too_long passed');
}

async function test_content_just_at_limit() {
  const content = 'x'.repeat(50_000); // at limit, should pass content check

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: 'chatcmpl-test', object: 'chat.completion', created: 1700000000, model: 'gpt-4o-mini',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ) as Response;

  const client = new AIClient({
    baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini',
  });

  const result = await executeSummarize(client, content);
  assert(result.error === undefined || result.success === true, 'content at limit should be allowed');
  console.log('✅ test_content_just_at_limit passed');
}

// --- Run all ---

async function main() {
  const tests = [
    test_summarize_prompt,
    test_translate_prompt,
    test_rewrite_prompt,
    test_reply_prompt,
    test_explain_prompt,
    test_summarize_success,
    test_translate_success,
    test_rewrite_success,
    test_reply_success,
    test_explain_success,
    test_empty_content,
    test_api_error,
    test_empty_api_result,
    test_content_too_long,
    test_content_just_at_limit,
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
