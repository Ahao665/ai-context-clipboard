import { useState, useCallback } from 'react';
import { HistoryList } from './components/HistoryList';
import { ActionBar } from './components/ActionBar';
import type { ActionBarAction } from './components/ActionBar';
import { AIResultView } from './components/AIResultView';
import { useClipboard } from './hooks/useClipboard';
import { useAI } from './hooks/useAI';
import { useClipboardStore } from './stores/clipboard-store';
import './App.css';

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { entries } = useClipboardStore();
  const {
    state,
    runSummarize,
    runTranslate,
    runRewrite,
    runReply,
    runExplain,
    clearResult,
  } = useAI();

  useClipboard();

  const selectedEntry = entries.find((e) => e.id === selectedId);

  const withContent = useCallback(
    (fn: (content: string) => void) => {
      if (selectedEntry?.content) {
        fn(selectedEntry.content);
      }
    },
    [selectedEntry],
  );

  const actions: ActionBarAction[] = [
    { id: 'summarize', label: '总结', title: '提取内容要点', handler: () => withContent(runSummarize) },
    { id: 'translate', label: '翻译', title: '翻译为中文', handler: () => withContent(runTranslate) },
    { id: 'rewrite', label: '润色', title: '改进表达和语法', handler: () => withContent(runRewrite) },
    { id: 'reply', label: '回复', title: '生成自然回复', handler: () => withContent(runReply) },
    { id: 'explain', label: '解释', title: '用简单语言解释', handler: () => withContent(runExplain) },
  ];

  const handleBack = () => {
    setSelectedId(null);
    clearResult();
  };

  if (selectedEntry) {
    return (
      <div className="app">
        <header className="app-header">
          <button className="back-btn" onClick={handleBack}>
            ← 返回
          </button>
        </header>
        <main className="app-main">
          <div className="detail-view">
            <div className="detail-content">
              {selectedEntry.content_preview || '(empty)'}
            </div>
            <ActionBar actions={actions} disabled={state.loading} />
            <AIResultView result={state.result} loading={state.loading} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Context Clipboard</h1>
      </header>
      <main className="app-main">
        <HistoryList onSelect={setSelectedId} />
      </main>
    </div>
  );
}
