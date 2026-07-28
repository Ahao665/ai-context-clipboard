import { HistoryItem } from './HistoryItem';
import { useClipboardStore } from '../stores/clipboard-store';

interface Props {
  onSelect: (id: string) => void;
}

export function HistoryList({ onSelect }: Props) {
  const { entries, selectedId, loading } = useClipboardStore();

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

  return (
    <div className="history-list">
      {entries.map((entry) => (
        <HistoryItem
          key={entry.id}
          entry={entry}
          isSelected={entry.id === selectedId}
          onClick={() => onSelect(entry.id)}
        />
      ))}
    </div>
  );
}
