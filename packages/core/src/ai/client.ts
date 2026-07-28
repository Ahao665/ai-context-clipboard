import type {
  Message,
  AIProviderConfig,
  AIRequest,
  AIResponse,
  AIError,
} from '@ai-clipboard/types';

const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TEMPERATURE = 0.7;
const MAX_CONTENT_LENGTH = 100_000;

function sanitizeError(raw: string): string {
  // Never leak API key in error messages
  return raw.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***');
}

const STATUS_MESSAGES: Record<number, string> = {
  400: '请求格式错误，请检查 API 配置',
  401: 'API Key 无效或已过期，请检查设置',
  403: 'API 访问被拒绝，请检查权限',
  429: 'API 请求过于频繁，请稍后重试',
  500: 'AI 服务暂时不可用，请稍后重试',
  502: 'AI 服务网关错误，请稍后重试',
  503: 'AI 服务暂时不可用，请稍后重试',
};

function createAIError(status: number, body: string): AIError {
  const sanitized = sanitizeError(body);

  try {
    const parsed = JSON.parse(sanitized);
    return {
      status,
      message: STATUS_MESSAGES[status] ?? parsed.error?.message ?? `请求失败 (HTTP ${status})`,
      code: parsed.error?.code,
      type: parsed.error?.type,
    };
  } catch {
    return {
      status,
      message: STATUS_MESSAGES[status] ?? `请求失败 (HTTP ${status})`,
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
    // Validate content length
    const totalLen = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (totalLen > MAX_CONTENT_LENGTH) {
      throw {
        status: 0,
        message: `内容过长（${totalLen} 字符），限制 ${MAX_CONTENT_LENGTH} 字符`,
        type: 'validation_error',
      } satisfies AIError;
    }

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
        message: err instanceof TypeError
          ? '无法连接到 AI 服务，请检查网络连接和 API 地址'
          : '网络请求失败',
        type: 'network_error',
      } satisfies AIError;
    }

    const responseBody = await response.text();

    if (!response.ok) {
      throw createAIError(response.status, responseBody);
    }

    if (!responseBody || !responseBody.trim()) {
      throw {
        status: response.status,
        message: 'AI 服务返回了空响应，请稍后重试',
        type: 'empty_response',
      } satisfies AIError;
    }

    try {
      const data: AIResponse = JSON.parse(responseBody);

      if (!data.choices || data.choices.length === 0) {
        throw {
          status: response.status,
          message: 'AI 返回了空结果，请稍后重试',
          type: 'empty_choices',
        } satisfies AIError;
      }

      return data;
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && 'message' in err) {
        throw err;
      }
      throw {
        status: response.status,
        message: 'AI 响应解析失败，请稍后重试',
        type: 'parse_error',
      } satisfies AIError;
    }
  }
}
