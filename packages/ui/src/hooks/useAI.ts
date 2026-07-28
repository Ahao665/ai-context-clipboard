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

export function useAI() {
  const [state, setState] = useState<AIState>({ loading: false, result: null });
  const clientRef = useRef<AIClient | null>(null);
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
      if (!clientRef.current) {
        setState({
          loading: false,
          result: { actionId, content: '', success: false, error: NO_API_KEY_MSG },
        });
        return;
      }

      setState({ loading: true, result: null });
      const actionResult = await executor(clientRef.current, content);
      setState({ loading: false, result: actionResult });
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
