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

export interface AIRequest {
  model: string;
  messages: Message[];
  max_tokens: number;
  temperature: number;
  stream: boolean;
}

export interface AIChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
  };
  finish_reason: 'stop' | 'length' | null;
}

export interface AIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: AIChoice[];
  usage?: AIUsage;
}

export interface AIError {
  code?: string;
  message: string;
  type?: string;
  status: number;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
}
