import { AIClient } from '../src/ai/client';
import type { AIProviderConfig, AIResponse } from '@ai-clipboard/types';

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


const TEST_CONFIG: AIProviderConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test-key',
  model: 'gpt-4o-mini',
};

function mockOk(body: unknown): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }) as Response;
}

function mockError(status: number, body: unknown): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      statusText: 'Error',
      headers: { 'content-type': 'application/json' },
    }) as Response;
}

function mockNetworkError(): typeof fetch {
  return async () => {
    throw new TypeError('Failed to fetch');
  };
}

function mockEmptyBody(): typeof fetch {
  return async () =>
    new Response('', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }) as Response;
}

// --- Config tests ---

function test_config() {
  const client = new AIClient(TEST_CONFIG);

  const config = client.getConfig();
  assert(config.baseUrl === 'https://api.openai.com/v1', 'baseUrl should match');
  assert(config.apiKey === 'sk-test-key', 'apiKey should match');
  assert(config.model === 'gpt-4o-mini', 'model should match');

  client.updateConfig({ ...TEST_CONFIG, model: 'gpt-4' });
  assert(client.getConfig().model === 'gpt-4', 'model should be updated');

  const config2 = client.getConfig();
  config2.model = 'modified';
  assert(client.getConfig().model === 'gpt-4', 'config should be immutable');

  console.log('✅ test_config passed');
}

// --- Request format tests ---

async function test_request_format() {
  let capturedBody: string | null = null;

  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    capturedBody = init.body as string;
    return new Response(JSON.stringify({
      id: 'chatcmpl-123', object: 'chat.completion', created: 1700000000, model: 'gpt-4o-mini',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  await client.chat([{ role: 'user', content: 'Hello' }]);

  const body = JSON.parse(capturedBody!);
  assert(body.model === 'gpt-4o-mini', 'request model should match');
  assert(body.messages[0].content === 'Hello', 'request messages should match');
  assert(body.stream === false, 'non-streaming should be false');
  assert(body.max_tokens === 2048, 'default max_tokens should be 2048');
  assert(body.temperature === 0.7, 'default temperature should be 0.7');

  console.log('✅ test_request_format passed');
}

async function test_api_url_and_auth() {
  let capturedUrl: string | null = null;
  let capturedAuth: string | null = null;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedAuth = (init.headers as Record<string, string>)['Authorization'];
    return new Response(JSON.stringify({
      id: 'chatcmpl-123', object: 'chat.completion', created: 1700000000, model: 'gpt-4o-mini',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  await client.chat([{ role: 'user', content: 'Hello' }]);

  assert(capturedUrl === 'https://api.openai.com/v1/chat/completions', 'URL should be correct');
  assert(capturedAuth === 'Bearer sk-test-key', 'auth header should be correct');

  console.log('✅ test_api_url_and_auth passed');
}

// --- Success test ---

async function test_successful_response() {
  const mockData: AIResponse = {
    id: 'chatcmpl-123', object: 'chat.completion', created: 1700000000, model: 'gpt-4o-mini',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };

  globalThis.fetch = mockOk(mockData) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  const result = await client.chat([{ role: 'user', content: 'Hi' }]);

  assert(result.id === 'chatcmpl-123', 'response id should match');
  assert(result.choices[0].message.content === 'Hello!', 'response content should match');
  assert(result.usage!.total_tokens === 15, 'token usage should match');

  console.log('✅ test_successful_response passed');
}

// --- Error handling tests ---

async function test_401_error() {
  globalThis.fetch = mockError(401, {
    error: { message: 'Invalid API key', code: 'invalid_api_key', type: 'authentication_error' },
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: 'Hi' }]);
    assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { status: number; message: string; code: string };
    assert(aiErr.status === 401, 'status should be 401');
    // Should use user-friendly Chinese message, not raw API error
    assert(aiErr.message.includes('API Key'), 'message should be user-friendly');
    assert(aiErr.code === 'invalid_api_key', 'code should match');
  }

  console.log('✅ test_401_error passed');
}

async function test_403_error() {
  globalThis.fetch = mockError(403, {
    error: { message: 'Forbidden', code: 'access_denied' },
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: 'Hi' }]);
    assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { status: number; message: string };
    assert(aiErr.status === 403, 'status should be 403');
    assert(aiErr.message.includes('拒绝'), '403 message should be user-friendly');
  }

  console.log('✅ test_403_error passed');
}

async function test_429_rate_limit() {
  globalThis.fetch = mockError(429, {
    error: { message: 'Rate limit exceeded', code: 'rate_limit', type: 'rate_limit_error' },
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: 'Hi' }]);
    assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { status: number; message: string; type: string };
    assert(aiErr.status === 429, 'status should be 429');
    assert(aiErr.message.includes('频繁'), '429 message should mention retry');
  }

  console.log('✅ test_429_rate_limit passed');
}

async function test_500_error() {
  globalThis.fetch = mockError(500, {
    error: { message: 'Internal server error' },
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: 'Hi' }]);
    assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { status: number; message: string };
    assert(aiErr.status === 500, 'status should be 500');
    assert(aiErr.message.includes('不可用'), '500 message should be user-friendly');
  }

  console.log('✅ test_500_error passed');
}

async function test_network_error() {
  globalThis.fetch = mockNetworkError() as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: 'Hi' }]);
    assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { status: number; type: string; message: string };
    assert(aiErr.status === 0, 'status should be 0 for network error');
    assert(aiErr.type === 'network_error', 'type should be network_error');
    assert(aiErr.message.includes('网络'), 'network error should be user-friendly');
  }

  console.log('✅ test_network_error passed');
}

async function test_empty_response_body() {
  globalThis.fetch = mockEmptyBody() as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: 'Hi' }]);
    assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { type: string; message: string };
    assert(aiErr.type === 'empty_response', 'should be empty_response type');
    assert(aiErr.message.includes('空响应'), 'should mention empty response');
  }

  console.log('✅ test_empty_response_body passed');
}

async function test_empty_choices() {
  globalThis.fetch = mockOk({
    id: 'chatcmpl-123', object: 'chat.completion', created: 1700000000, model: 'gpt-4o-mini', choices: [],
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: 'Hi' }]);
    assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { type: string; message: string };
    assert(aiErr.type === 'empty_choices', 'should be empty_choices type');
    assert(aiErr.message.includes('空结果'), 'should mention empty result');
  }

  console.log('✅ test_empty_choices passed');
}

async function test_content_length_limit() {
  // Build content exceeding 100k chars
  const longContent = 'x'.repeat(100_001);

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: longContent }]);
    assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { type: string; status: number };
    assert(aiErr.type === 'validation_error', 'should be validation_error');
    assert(aiErr.status === 0, 'status should be 0');
  }

  console.log('✅ test_content_length_limit passed');
}

async function test_api_key_sanitization() {
  // Error body containing API key should be sanitized
  globalThis.fetch = mockError(401, {
    error: {
      message: 'Invalid API key: sk-abc123def456ghi789jkl012',
      code: 'invalid_api_key',
    },
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: 'Hi' }]);
    assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { message: string };
    // The sanitized message should use the user-friendly mapping, not expose the raw API key
    assert(aiErr.message.includes('API Key'), 'should use user-friendly message');
  }

  console.log('✅ test_api_key_sanitization passed');
}

async function test_custom_base_url() {
  let capturedUrl: string | null = null;

  globalThis.fetch = (async (url: string) => {
    capturedUrl = url;
    return new Response(JSON.stringify({
      id: 'chatcmpl-123', object: 'chat.completion', created: 1700000000, model: 'deepseek-chat',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;

  const client = new AIClient({
    baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-ds-key', model: 'deepseek-chat',
  });

  await client.chat([{ role: 'user', content: 'Hello' }]);
  assert(capturedUrl === 'https://api.deepseek.com/v1/chat/completions', 'custom baseUrl should work');

  console.log('✅ test_custom_base_url passed');
}

// --- Run all ---

async function main() {
  const tests = [
    test_config,
    test_request_format,
    test_api_url_and_auth,
    test_successful_response,
    test_401_error,
    test_403_error,
    test_429_rate_limit,
    test_500_error,
    test_network_error,
    test_empty_response_body,
    test_empty_choices,
    test_content_length_limit,
    test_api_key_sanitization,
    test_custom_base_url,
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
