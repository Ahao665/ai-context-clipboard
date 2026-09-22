import { useCallback, useEffect, useState } from 'react';
import type { ActionResult } from '@ai-clipboard/types';
import { setClipboard } from '../lib/tauri-api';

interface Props {
  result: ActionResult | null;
  loading: boolean;
  /** Abort the in-flight request. Omitted when the panel is read-only. */
  onCancel?: () => void;
}

export function AIResultView({ result, loading, onCancel }: Props) {
  const [copied, setCopied] = useState(false);

  // Reset the confirmation when a different result arrives.
  useEffect(() => {
    setCopied(false);
  }, [result?.content]);

  const handleCopy = useCallback(async () => {
    const text = result?.content;
    if (!text) return;
    try {
      await setClipboard(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Writing the clipboard fails when another process holds it; leaving the
      // button in its idle state is enough feedback.
    }
  }, [result?.content]);

  if (loading) {
    return (
      <div className="ai-result">
        <div className="ai-result-header">
          <span>AI 结果</span>
          {onCancel && (
            <button type="button" className="ai-result-btn" onClick={onCancel}>
              取消
            </button>
          )}
        </div>
        <div className="ai-result-body">
          <div className="ai-thinking">思考中...</div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="ai-result">
      <div className="ai-result-header">
        <span>AI 结果</span>
        {result.success && result.content && (
          <button type="button" className="ai-result-btn" onClick={handleCopy}>
            {copied ? '已复制' : '复制'}
          </button>
        )}
      </div>
      <div className="ai-result-body">
        {result.success ? (
          <div className="ai-result-content">{result.content}</div>
        ) : (
          <div className="ai-error">{result.error}</div>
        )}
      </div>
    </div>
  );
}
