import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AIClient,
  executeSummarize,
  executeTranslate,
  executeRewrite,
  executeReply,
  executeExplain,
} from '@ai-clipboard/core';
import { useSettingsStore } from '../stores/settings-store';
import type { ActionResult } from '@ai-clipboard/types';

interface AIState {
  loading: boolean;
  result: ActionResult | null;
}

const NO_API_KEY_MSG = '请先在设置中配置 API Key';
const NO_CONTENT_MSG = '没有可处理的内容';

export function useAI() {
  const [state, setState] = useState<AIState>({ loading: false, result: null });
  const clientRef = useRef<AIClient | null>(null);
  const runningRef = useRef(false);
  const { aiConfig, loadConfig } = useSettingsStore();

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (aiConfig.apiKey) {
      clientRef.current = new AIClient(aiConfig);
    }
  }, [aiConfig]);

  const run = useCallback(
    async (
      actionId: ActionResult['actionId'],
      content: string,
      executor: (client: AIClient, content: string) => Promise<ActionResult>,
    ) => {
      // Double-click guard
      if (runningRef.current) return;

      // Content guard
      if (!content || !content.trim()) {
        setState({
          loading: false,
          result: { actionId, content: '', success: false, error: NO_CONTENT_MSG },
        });
        return;
      }

      // API key guard
      if (!clientRef.current) {
        setState({
          loading: false,
          result: { actionId, content: '', success: false, error: NO_API_KEY_MSG },
        });
        return;
      }

      runningRef.current = true;
      setState({ loading: true, result: null });

      try {
        const actionResult = await executor(clientRef.current, content);
        setState({ loading: false, result: actionResult });
      } catch {
        setState({
          loading: false,
          result: { actionId, content: '', success: false, error: '操作失败，请稍后重试' },
        });
      } finally {
        runningRef.current = false;
      }
    },
    [],
  );

  const runSummarize = useCallback(
    (content: string) => run('text.summarize', content, executeSummarize),
    [run],
  );

  const runTranslate = useCallback(
    (content: string) => run('text.translate', content, executeTranslate),
    [run],
  );

  const runRewrite = useCallback(
    (content: string) => run('text.polish', content, executeRewrite),
    [run],
  );

  const runReply = useCallback(
    (content: string) => run('text.reply', content, executeReply),
    [run],
  );

  const runExplain = useCallback(
    (content: string) => run('text.explain', content, executeExplain),
    [run],
  );

  const clearResult = useCallback(() => {
    setState({ loading: false, result: null });
  }, []);

  return {
    state,
    runSummarize,
    runTranslate,
    runRewrite,
    runReply,
    runExplain,
    clearResult,
  };
}
