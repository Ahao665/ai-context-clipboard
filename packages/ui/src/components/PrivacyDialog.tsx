import { useState } from 'react';

interface Props {
  content: string;
  actionLabel: string;
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}

export function PrivacyDialog({ content, actionLabel, onConfirm, onCancel }: Props) {
  const [dontAsk, setDontAsk] = useState(false);

  return (
    <div className="privacy-overlay">
      <div className="privacy-dialog">
        <h3>AI 处理确认</h3>
        <p>
          以下内容将发送到 AI API 进行「{actionLabel}」处理：
        </p>
        <pre className="privacy-preview">{content.slice(0, 500)}</pre>
        <p className="privacy-note">
          请确认内容不包含敏感信息。API 提供商将处理此数据。
        </p>
        <label className="privacy-checkbox">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
          />
          不再提示（可在设置中重新开启）
        </label>
        <div className="privacy-buttons">
          <button className="cancel-btn" onClick={onCancel}>取消</button>
          <button className="confirm-btn" onClick={() => onConfirm(dontAsk)}>
            确认发送
          </button>
        </div>
      </div>
    </div>
  );
}
