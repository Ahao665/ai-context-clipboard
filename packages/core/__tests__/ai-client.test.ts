import { AIClient } from '../src/ai/client';
import type { AIProviderConfig, AIResponse } from '@ai-clipboard/types';

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

// --- Config tests ---

function test_config() {
  const client = new AIClient(TEST_CONFIG);

  // getConfig returns stored config
  const config = client.getConfig();
  console.assert(config.baseUrl === 'https://api.openai.com/v1', 'baseUrl should match');
  console.assert(config.apiKey === 'sk-test-key', 'apiKey should match');
  console.assert(config.model === 'gpt-4o-mini', 'model should match');
  console.assert(config.maxTokens === undefined, 'maxTokens should be undefined');

  // updateConfig changes model
  client.updateConfig({ ...TEST_CONFIG, model: 'gpt-4' });
  console.assert(client.getConfig().model === 'gpt-4', 'model should be updated');

  // getConfig returns a copy (immutable)
  const config2 = client.getConfig();
  config2.model = 'modified';
  console.assert(client.getConfig().model === 'gpt-4', 'config should be immutable via getConfig');

  console.log('✅ test_config passed');
}

// --- Request format tests ---

async function test_request_format() {
  let capturedBody: string | null = null;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    capturedBody = init.body as string;
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'gpt-4o-mini',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  await client.chat([{ role: 'user', content: 'Hello' }]);

  const body = JSON.parse(capturedBody!);
  console.assert(body.model === 'gpt-4o-mini', 'request model should match');
  console.assert(body.messages[0].content === 'Hello', 'request messages should match');
  console.assert(body.stream === false, 'non-streaming should be false');
  console.assert(body.max_tokens === 2048, 'default max_tokens should be 2048');
  console.assert(body.temperature === 0.7, 'default temperature should be 0.7');

  console.log('✅ test_request_format passed');
}

async function test_api_url_and_auth() {
  let capturedUrl: string | null = null;
  let capturedAuth: string | null = null;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedAuth = (init.headers as Record<string, string>)['Authorization'];
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'gpt-4o-mini',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  await client.chat([{ role: 'user', content: 'Hello' }]);

  console.assert(capturedUrl === 'https://api.openai.com/v1/chat/completions', 'URL should be correct');
  console.assert(capturedAuth === 'Bearer sk-test-key', 'auth header should be correct');

  console.log('✅ test_api_url_and_auth passed');
}

// --- Success test ---

async function test_successful_response() {
  const mockData: AIResponse = {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1700000000,
    model: 'gpt-4o-mini',
    choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };

  globalThis.fetch = mockOk(mockData) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  const result = await client.chat([{ role: 'user', content: 'Hi' }]);

  console.assert(result.id === 'chatcmpl-123', 'response id should match');
  console.assert(result.choices[0].message.content === 'Hello!', 'response content should match');
  console.assert(result.usage!.total_tokens === 15, 'token usage should match');

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
    console.assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { status: number; message: string; code: string };
    console.assert(aiErr.status === 401, 'status should be 401');
    console.assert(aiErr.message === 'Invalid API key', 'message should match');
    console.assert(aiErr.code === 'invalid_api_key', 'code should match');
  }

  console.log('✅ test_401_error passed');
}

async function test_500_error() {
  globalThis.fetch = mockError(500, {
    error: { message: 'Internal server error' },
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: 'Hi' }]);
    console.assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { status: number; message: string };
    console.assert(aiErr.status === 500, 'status should be 500');
    console.assert(aiErr.message === 'Internal server error', 'message should match');
  }

  console.log('✅ test_500_error passed');
}

async function test_network_error() {
  globalThis.fetch = mockNetworkError() as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: 'Hi' }]);
    console.assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { status: number; type: string };
    console.assert(aiErr.status === 0, 'status should be 0 for network error');
    console.assert(aiErr.type === 'network_error', 'type should be network_error');
  }

  console.log('✅ test_network_error passed');
}

async function test_empty_choices() {
  globalThis.fetch = mockOk({
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1700000000,
    model: 'gpt-4o-mini',
    choices: [],
  }) as unknown as typeof fetch;

  const client = new AIClient(TEST_CONFIG);
  try {
    await client.chat([{ role: 'user', content: 'Hi' }]);
    console.assert(false, 'should have thrown');
  } catch (err: unknown) {
    const aiErr = err as { message: string };
    console.assert(aiErr.message === 'API returned empty choices', 'should report empty choices');
  }

  console.log('✅ test_empty_choices passed');
}

async function test_custom_base_url() {
  let capturedUrl: string | null = null;

  globalThis.fetch = (async (url: string) => {
    capturedUrl = url;
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'deepseek-chat',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const client = new AIClient({
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'sk-ds-key',
    model: 'deepseek-chat',
  });

  await client.chat([{ role: 'user', content: 'Hello' }]);
  console.assert(capturedUrl === 'https://api.deepseek.com/v1/chat/completions', 'custom baseUrl should work');

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
    test_500_error,
    test_network_error,
    test_empty_choices,
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
