import type { ActionResult } from '@ai-clipboard/types';

interface Props {
  result: ActionResult | null;
  loading: boolean;
}

export function AIResultView({ result, loading }: Props) {
  if (loading) {
    return (
      <div className="ai-result">
        <div className="ai-result-header">
          <span>AI 结果</span>
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
