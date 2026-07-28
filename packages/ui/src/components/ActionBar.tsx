interface Props {
  onSummarize: () => void;
  disabled: boolean;
}

export function ActionBar({ onSummarize, disabled }: Props) {
  return (
    <div className="action-bar">
      <button
        className="action-btn"
        onClick={onSummarize}
        disabled={disabled}
        title="提取内容要点"
      >
        总结
      </button>
    </div>
  );
}
