import { useState } from 'react';
import { HistoryList } from './components/HistoryList';
import { useClipboard } from './hooks/useClipboard';
import './App.css';

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useClipboard();

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Context Clipboard</h1>
        <input
          className="search-input"
          placeholder="搜索剪贴板..."
        />
      </header>
      <main className="app-main">
        <HistoryList onSelect={setSelectedId} />
      </main>
    </div>
  );
}
