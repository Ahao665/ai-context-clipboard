import type { ActionResult } from '@ai-clipboard/types';
import { AIClient } from '../ai/client';
import { executeAction } from './shared';

export function buildRewritePrompt(content: string): string {
  return `请改进以下文本的表达，修正语法和措辞，使其更清晰专业，保持原意。只返回润色后的文本：\n\n${content}`;
}

export async function executeRewrite(
  client: AIClient,
  content: string,
): Promise<ActionResult> {
  return executeAction(client, content, buildRewritePrompt, 'text.polish', '内容为空，无法润色');
}
