import { AIClient } from '../ai/client';
import type { ActionId, ActionResult, AIError } from '@ai-clipboard/types';

const MAX_CHARS = 50_000;

export async function executeAction(
  client: AIClient,
  content: string,
  buildPrompt: (content: string) => string,
  actionId: ActionId,
  emptyMessage?: string,
): Promise<ActionResult> {
  // Empty content check
  if (!content || !content.trim()) {
    return {
      actionId,
      content: '',
      success: false,
      error: emptyMessage ?? '内容为空，无法处理',
    };
  }

  // Content length guard
  if (content.length > MAX_CHARS) {
    return {
      actionId,
      content: '',
      success: false,
      error: `内容过长（${content.length} 字符），限制 ${MAX_CHARS} 字符`,
    };
  }

  try {
    const prompt = buildPrompt(content);
    const response = await client.chat([{ role: 'user', content: prompt }]);
    const result = response.choices[0]?.message?.content ?? '';

    // Empty result from AI
    if (!result || !result.trim()) {
      return {
        actionId,
        content: '',
        success: false,
        error: 'AI 未返回有效结果，请稍后重试',
      };
    }

    return {
      actionId,
      content: result,
      success: true,
    };
  } catch (err: unknown) {
    // Preserve structured AIError when available
    if (err && typeof err === 'object' && 'message' in err && 'status' in err) {
      const aiErr = err as AIError;
      return {
        actionId,
        content: '',
        success: false,
        error: aiErr.message,
      };
    }

    return {
      actionId,
      content: '',
      success: false,
      error: 'AI 调用失败，请稍后重试',
    };
  }
}
