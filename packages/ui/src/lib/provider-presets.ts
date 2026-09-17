import type { AIProviderConfig } from '@ai-clipboard/types';

/** A selectable AI provider preset — filling in baseUrl + a sensible default model. */
export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  /** Placeholder shown in the API key field, e.g. "sk-…". */
  keyHint: string;
  /** Where the user gets a key — shown as a hint in the panel. */
  docsUrl: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyHint: 'sk-…',
    docsUrl: 'https://platform.deepseek.com',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyHint: 'sk-…',
    docsUrl: 'https://platform.openai.com',
  },
  {
    id: 'qwen',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    keyHint: 'sk-…',
    docsUrl: 'https://help.aliyun.com/zh/model-studio',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyHint: 'sk-…',
    docsUrl: 'https://platform.moonshot.cn',
  },
  {
    id: 'custom',
    label: '自定义',
    baseUrl: '',
    model: '',
    keyHint: '任意 OpenAI 兼容服务的 Key',
    docsUrl: '',
  },
];

/** Match a stored config back to a preset id so the panel can highlight it. */
export function matchPreset(config: AIProviderConfig): string {
  const normalized = config.baseUrl.replace(/\/+$/, '');
  const hit = PROVIDER_PRESETS.find(
    (p) => p.id !== 'custom' && p.baseUrl.replace(/\/+$/, '') === normalized,
  );
  return hit ? hit.id : 'custom';
}

/** Client-side validation shared by the settings panel. Returns an error list (empty = valid). */
export function validateAIConfig(config: AIProviderConfig): string[] {
  const errors: string[] = [];
  const baseUrl = config.baseUrl.trim();

  if (!baseUrl) {
    errors.push('请填写 API 地址');
  } else if (!/^https?:\/\//i.test(baseUrl)) {
    errors.push('API 地址需以 http:// 或 https:// 开头');
  }

  if (!config.model.trim()) {
    errors.push('请填写模型名称');
  }

  // The API key is optional at rest so users can review a saved config, but a
  // blank key means AI actions will fail — surfaced by the panel as a warning.
  return errors;
}

/** True when the config is complete enough to actually call the API. */
export function isConfigUsable(config: AIProviderConfig): boolean {
  return (
    validateAIConfig(config).length === 0 &&
    config.apiKey.trim().length > 0
  );
}
