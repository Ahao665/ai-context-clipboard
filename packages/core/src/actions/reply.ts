import type { ActionResult } from '@ai-clipboard/types';
import { AIClient, type ChatOptions } from '../ai/client';
import { executeAction } from './shared';

export function buildReplyPrompt(content: string): string {
  return `根据以下内容生成自然的回复。回复要友好、得体，符合上下文。只返回回复内容：\n\n${content}`;
}

export async function executeReply(
  client: AIClient,
  content: string,
  options?: ChatOptions,
): Promise<ActionResult> {
  return executeAction(client, content, buildReplyPrompt, 'text.reply', '内容为空，无法生成回复', options);
}
