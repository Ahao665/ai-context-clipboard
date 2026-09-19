import { CONTENT_TYPE_ICONS } from '@ai-clipboard/core';
import type { ClipboardEntry } from '@ai-clipboard/types';
import { entryPreview } from '../lib/entry-preview';

interface Props {
  entry: ClipboardEntry;
  isSelected: boolean;
  onClick: () => void;
  onTogglePin: (entry: ClipboardEntry) => void;
}

export function HistoryItem({ entry, isSelected, onClick, onTogglePin }: Props) {
  const icon = CONTENT_TYPE_ICONS[entry.content_type] ?? '📋';
  const time = new Date(entry.created_at).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const pinned = Boolean(entry.is_pinned);
  const sensitive = entry.subtype === 'sensitive';

  return (
    <div
      className={`history-item ${isSelected ? 'selected' : ''} ${pinned ? 'pinned' : ''}`}
      onClick={onClick}
    >
      <span className="history-icon">{icon}</span>
      <div className="history-body">
        <div className="history-preview">
          {entryPreview(entry)}
          {sensitive ? <span className="history-badge">⚠ 敏感</span> : null}
        </div>
        <div className="history-meta">
          <span>{time}</span>
          {entry.source_app && <span>{entry.source_app}</span>}
        </div>
      </div>
      <button
        type="button"
        className={`history-pin ${pinned ? 'active' : ''}`}
        title={pinned ? '取消置顶' : '置顶'}
        aria-label={pinned ? '取消置顶' : '置顶'}
        aria-pressed={pinned}
        onClick={(e) => {
          // Keep the click from also opening the detail view.
          e.stopPropagation();
          onTogglePin(entry);
        }}
      >
        {pinned ? '📌' : '📍'}
      </button>
    </div>
  );
}
