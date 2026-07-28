import { AIClient } from '../ai/client';
import type { ActionId, ActionResult } from '@ai-clipboard/types';

export async function executeAction(
  client: AIClient,
  content: string,
  buildPrompt: (content: string) => string,
  actionId: ActionId,
  emptyMessage?: string,
): Promise<ActionResult> {
  if (!content || !content.trim()) {
    return {
      actionId,
      content: '',
      success: false,
      error: emptyMessage ?? '内容为空，无法处理',
    };
  }

  try {
    const prompt = buildPrompt(content);
    const response = await client.chat([{ role: 'user', content: prompt }]);
    const result = response.choices[0]?.message?.content ?? '';

    return {
      actionId,
      content: result,
      success: true,
    };
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'AI 调用失败';

    return {
      actionId,
      content: '',
      success: false,
      error: message,
    };
  }
}
