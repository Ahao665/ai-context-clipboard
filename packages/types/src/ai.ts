export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
}
