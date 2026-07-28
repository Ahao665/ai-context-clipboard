import type { ClipboardEntry } from '@ai-clipboard/types';

interface Props {
  entry: ClipboardEntry;
  isSelected: boolean;
  onClick: () => void;
}

const typeIcon: Record<string, string> = {
  text: '📝',
  code: '💻',
  url: '🔗',
  json: '📊',
  email: '✉️',
  unknown: '📋',
};

export function HistoryItem({ entry, isSelected, onClick }: Props) {
  const icon = typeIcon[entry.content_type] || '📋';
  const time = new Date(entry.created_at).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`history-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <span className="history-icon">{icon}</span>
      <div className="history-body">
        <div className="history-preview">{entry.content_preview || '(empty)'}</div>
        <div className="history-meta">
          <span>{time}</span>
          {entry.source_app && <span>{entry.source_app}</span>}
        </div>
      </div>
    </div>
  );
}
