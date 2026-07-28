import { useState } from 'react';
import { HistoryList } from './components/HistoryList';
import { ActionBar } from './components/ActionBar';
import { AIResultView } from './components/AIResultView';
import { useClipboard } from './hooks/useClipboard';
import { useAI } from './hooks/useAI';
import { useClipboardStore } from './stores/clipboard-store';
import './App.css';

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { entries } = useClipboardStore();
  const { state, runSummarize, clearResult } = useAI();

  useClipboard();

  const selectedEntry = entries.find((e) => e.id === selectedId);

  const handleSummarize = () => {
    if (selectedEntry?.content) {
      runSummarize(selectedEntry.content);
    }
  };

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
            <ActionBar
              onSummarize={handleSummarize}
              disabled={state.loading}
            />
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
