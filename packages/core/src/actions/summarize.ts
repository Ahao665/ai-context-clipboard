import type { ActionResult } from '@ai-clipboard/types';
import { AIClient, type ChatOptions } from '../ai/client';
import { executeAction } from './shared';

export function buildSummarizePrompt(content: string): string {
  return `请总结以下内容的要点，用中文输出，分点列出：\n\n${content}`;
}

export async function executeSummarize(
  client: AIClient,
  content: string,
  options?: ChatOptions,
): Promise<ActionResult> {
  return executeAction(client, content, buildSummarizePrompt, 'text.summarize', '内容为空，无法总结', options);
}
