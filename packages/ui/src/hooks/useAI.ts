import { useState, useCallback, useRef, useEffect } from 'react';
import { AIClient, executeSummarize } from '@ai-clipboard/core';
import { useSettingsStore } from '../stores/settings-store';
import type { ActionResult } from '@ai-clipboard/types';

interface AIState {
  loading: boolean;
  result: ActionResult | null;
}

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

  const runSummarize = useCallback(async (content: string) => {
    if (!clientRef.current) {
      setState({
        loading: false,
        result: {
          actionId: 'text.summarize',
          content: '',
          success: false,
          error: '请先在设置中配置 API Key',
        },
      });
      return;
    }

    setState({ loading: true, result: null });

    const actionResult = await executeSummarize(clientRef.current, content);
    setState({ loading: false, result: actionResult });
  }, []);

  const clearResult = useCallback(() => {
    setState({ loading: false, result: null });
  }, []);

  return { state, runSummarize, clearResult };
}
