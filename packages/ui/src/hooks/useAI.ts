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
  const abortRef = useRef<AbortController | null>(null);
  /** Identifies the in-flight run so a cancelled one cannot overwrite a newer one. */
  const runIdRef = useRef(0);
  const { aiConfig, loadConfig } = useSettingsStore();

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    // The client must be rebuilt *or dropped* whenever the config changes.
    // Assigning only when a key is present used to leave the previous client in
    // place, so clearing the API key kept sending requests with the old one
    // instead of reporting that no key is configured.
    if (aiConfig.apiKey) {
      if (clientRef.current) clientRef.current.updateConfig(aiConfig);
      else clientRef.current = new AIClient(aiConfig);
    } else {
      clientRef.current = null;
    }
  }, [aiConfig]);

  const run = useCallback(
    async (
      actionId: ActionResult['actionId'],
      content: string,
      executor: (
        client: AIClient,
        content: string,
        options: { signal: AbortSignal },
      ) => Promise<ActionResult>,
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
      const client = clientRef.current;
      if (!client) {
        setState({
          loading: false,
          result: { actionId, content: '', success: false, error: NO_API_KEY_MSG },
        });
        return;
      }

      runningRef.current = true;
      const runId = ++runIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ loading: true, result: null });

      try {
        const actionResult = await executor(client, content, { signal: controller.signal });
        if (runIdRef.current !== runId) return; // superseded by a cancel + retry
        setState({ loading: false, result: actionResult });
      } catch {
        if (runIdRef.current !== runId) return;
        setState({
          loading: false,
          result: { actionId, content: '', success: false, error: '操作失败，请稍后重试' },
        });
      } finally {
        if (runIdRef.current === runId) {
          runningRef.current = false;
          abortRef.current = null;
        }
      }
    },
    [],
  );

  /**
   * Abort the in-flight request.
   *
   * `executeAction` turns the resulting abort into a normal failed
   * `ActionResult`, but that result is deliberately discarded — the panel
   * simply returns to its idle state, which is what a cancel should look like.
   */
  const cancel = useCallback(() => {
    if (!abortRef.current) return;
    runIdRef.current += 1; // invalidate the in-flight run
    runningRef.current = false;
    abortRef.current.abort();
    abortRef.current = null;
    setState({ loading: false, result: null });
  }, []);

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
    cancel,
    clearResult,
  };
}
