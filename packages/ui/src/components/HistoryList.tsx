import { useCallback } from 'react';
import type { ClipboardEntry } from '@ai-clipboard/types';
import { HistoryItem } from './HistoryItem';
import { useClipboardStore } from '../stores/clipboard-store';
import { togglePin } from '../lib/tauri-api';

interface Props {
  onSelect: (id: string) => void;
}

export function HistoryList({ onSelect }: Props) {
  const { entries, selectedId, loading, setPinned } = useClipboardStore();

  const handleTogglePin = useCallback(
    async (entry: ClipboardEntry) => {
      // Optimistic: the store re-sorts immediately, then we reconcile with the
      // authoritative value the backend reports.
      const next = !entry.is_pinned;
      setPinned(entry.id, next);
      try {
        const actual = await togglePin(entry.id);
        if (actual !== next) setPinned(entry.id, actual);
      } catch {
        setPinned(entry.id, Boolean(entry.is_pinned)); // revert
      }
    },
    [setPinned],
  );

  if (loading) {
    return <div className="history-status">加载中...</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="history-status">
        暂无剪贴板历史
        <br />
        按 Ctrl+C 复制内容开始使用
      </div>
    );
  }

  const pinned = entries.filter((e) => e.is_pinned);
  const rest = entries.filter((e) => !e.is_pinned);

  return (
    <div className="history-list">
      {pinned.length > 0 && (
        <>
          <div className="history-group-title">📌 已置顶</div>
          {pinned.map((entry) => (
            <HistoryItem
              key={entry.id}
              entry={entry}
              isSelected={entry.id === selectedId}
              onClick={() => onSelect(entry.id)}
              onTogglePin={handleTogglePin}
            />
          ))}
          <div className="history-group-title">最近</div>
        </>
      )}
      {rest.map((entry) => (
        <HistoryItem
          key={entry.id}
          entry={entry}
          isSelected={entry.id === selectedId}
          onClick={() => onSelect(entry.id)}
          onTogglePin={handleTogglePin}
        />
      ))}
    </div>
  );
}
