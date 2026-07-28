import type {
  Message,
  AIProviderConfig,
  AIRequest,
  AIResponse,
  AIError,
} from '@ai-clipboard/types';

const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.7;

function createAIError(status: number, body: string): AIError {
  try {
    const parsed = JSON.parse(body);
    return {
      status,
      message: parsed.error?.message ?? body,
      code: parsed.error?.code,
      type: parsed.error?.type,
    };
  } catch {
    return {
      status,
      message: body || `HTTP ${status}`,
    };
  }
}

export class AIClient {
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  updateConfig(config: AIProviderConfig): void {
    this.config = config;
  }

  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  private buildRequest(messages: Message[], stream: boolean): AIRequest {
    return {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: this.config.temperature ?? DEFAULT_TEMPERATURE,
      stream,
    };
  }

  async chat(messages: Message[]): Promise<AIResponse> {
    const body = this.buildRequest(messages, false);
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw {
        status: 0,
        message: err instanceof Error ? err.message : 'Network request failed',
        type: 'network_error',
      } satisfies AIError;
    }

    const responseBody = await response.text();

    if (!response.ok) {
      throw createAIError(response.status, responseBody);
    }

    try {
      const data: AIResponse = JSON.parse(responseBody);

      if (!data.choices || data.choices.length === 0) {
        throw {
          status: response.status,
          message: 'API returned empty choices',
          type: 'api_error',
        } satisfies AIError;
      }

      return data;
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && 'message' in err) {
        throw err;
      }
      throw {
        status: response.status,
        message: err instanceof Error ? err.message : 'Failed to parse response',
        type: 'parse_error',
      } satisfies AIError;
    }
  }
}
