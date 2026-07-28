import type { ActionResult } from '@ai-clipboard/types';
import { AIClient } from '../ai/client';
import { executeAction } from './shared';

export function buildExplainPrompt(content: string): string {
  return `请用简单易懂的语言解释以下内容，适合初学者理解。用中文输出：\n\n${content}`;
}

export async function executeExplain(
  client: AIClient,
  content: string,
): Promise<ActionResult> {
  return executeAction(client, content, buildExplainPrompt, 'text.explain', '内容为空，无法解释');
}
