import { AIClient } from './ai/client';
import { buildSummarizePrompt } from './prompt-templates';
import type { ActionResult } from '@ai-clipboard/types';

export async function executeSummarize(
  client: AIClient,
  content: string,
): Promise<ActionResult> {
  if (!content || !content.trim()) {
    return {
      actionId: 'text.summarize',
      content: '',
      success: false,
      error: '内容为空，无法总结',
    };
  }

  try {
    const prompt = buildSummarizePrompt(content);
    const response = await client.chat([{ role: 'user', content: prompt }]);
    const result = response.choices[0]?.message?.content ?? '';

    return {
      actionId: 'text.summarize',
      content: result,
      success: true,
    };
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'AI 调用失败';

    return {
      actionId: 'text.summarize',
      content: '',
      success: false,
      error: message,
    };
  }
}
