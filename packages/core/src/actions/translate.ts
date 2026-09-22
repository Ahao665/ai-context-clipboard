import type { ActionResult } from '@ai-clipboard/types';
import { AIClient, type ChatOptions } from '../ai/client';
import { executeAction } from './shared';

export function buildTranslatePrompt(content: string): string {
  return `请将以下内容翻译成中文，保持原文风格和语气。只返回翻译结果，不要加解释：\n\n${content}`;
}

export async function executeTranslate(
  client: AIClient,
  content: string,
  options?: ChatOptions,
): Promise<ActionResult> {
  return executeAction(client, content, buildTranslatePrompt, 'text.translate', '内容为空，无法翻译', options);
}
