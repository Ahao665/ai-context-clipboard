import { useState, useEffect, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ActionId, ClipboardEntry } from '@ai-clipboard/types';
import { CommandPalette } from './components/CommandPalette';
import { ActionBar } from './components/ActionBar';
import type { ActionBarAction } from './components/ActionBar';
import { AIResultView } from './components/AIResultView';
import { PrivacyDialog } from './components/PrivacyDialog';
import { useClipboard } from './hooks/useClipboard';
import { useAI } from './hooks/useAI';
import { setClipboard } from './lib/tauri-api';
import { useClipboardStore } from './stores/clipboard-store';
import { useSettingsStore } from './stores/settings-store';
import './App.css';

interface PendingAction {
  label: string;
  handler: () => void;
}

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const { entries } = useClipboardStore();
  const { privacyAccepted, privacyChecked, checkPrivacy, acceptPrivacyAction } = useSettingsStore();
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

  useEffect(() => {
    checkPrivacy();
  }, [checkPrivacy]);

  const selectedEntry = entries.find((e) => e.id === selectedId);

  const withPrivacy = useCallback(
    (label: string, fn: () => void) => {
      if (privacyAccepted) {
        fn();
      } else {
        setPendingAction({ label, handler: fn });
      }
    },
    [privacyAccepted],
  );

  const handlePrivacyConfirm = async (dontAskAgain: boolean) => {
    if (dontAskAgain) {
      await acceptPrivacyAction();
    }
    setPendingAction(null);
    pendingAction?.handler();
  };

  const handlePrivacyCancel = () => {
    setPendingAction(null);
  };

  const withContent = useCallback(
    (fn: (content: string) => void) => {
      if (selectedEntry?.content) {
        fn(selectedEntry.content);
      }
    },
    [selectedEntry],
  );

  const commandRunners: Record<string, (c: string) => void> = {
    'text.summarize': runSummarize,
    'text.translate': runTranslate,
    'text.polish': runRewrite,
    'text.reply': runReply,
    'text.explain': runExplain,
  };
  const commandLabels: Record<string, string> = {
    'text.summarize': '总结',
    'text.translate': '翻译',
    'text.polish': '润色',
    'text.reply': '回复',
    'text.explain': '解释',
  };

  const handlePaletteCommand = useCallback(
    (_commandId: string, actionId: ActionId, target: ClipboardEntry | null) => {
      const content = target?.content;
      const runner = commandRunners[actionId];
      const label = commandLabels[actionId] ?? actionId;
      if (content && runner) {
        setSelectedId(target.id); // open the target's detail view
        withPrivacy(label, () => runner(content)); // reuse existing privacy flow
      }
    },
    [commandRunners, commandLabels, withPrivacy, setSelectedId],
  );

  const handleQuickPaste = useCallback(async (entry: ClipboardEntry) => {
    if (!entry.content) return;
    await setClipboard(entry.content);
    void getCurrentWindow().hide();
  }, []);

  const hideWindow = useCallback(() => {
    void getCurrentWindow().hide();
  }, []);

  const actions: ActionBarAction[] = [
    { id: 'summarize', label: '总结', title: '提取内容要点', handler: () => withContent((c) => withPrivacy('总结', () => runSummarize(c))) },
    { id: 'translate', label: '翻译', title: '翻译为中文', handler: () => withContent((c) => withPrivacy('翻译', () => runTranslate(c))) },
    { id: 'rewrite', label: '润色', title: '改进表达和语法', handler: () => withContent((c) => withPrivacy('润色', () => runRewrite(c))) },
    { id: 'reply', label: '回复', title: '生成自然回复', handler: () => withContent((c) => withPrivacy('回复', () => runReply(c))) },
    { id: 'explain', label: '解释', title: '用简单语言解释', handler: () => withContent((c) => withPrivacy('解释', () => runExplain(c))) },
  ];

  const handleBack = () => {
    setSelectedId(null);
    clearResult();
  };

  if (!privacyChecked) {
    return (
      <div className="app">
        <div className="history-status">加载中...</div>
      </div>
    );
  }

  return (
    <div className="app">
      {pendingAction && selectedEntry?.content && (
        <PrivacyDialog
          content={selectedEntry.content}
          actionLabel={pendingAction.label}
          onConfirm={handlePrivacyConfirm}
          onCancel={handlePrivacyCancel}
        />
      )}

      {selectedEntry ? (
        <>
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
        </>
      ) : (
        <>
          <header className="app-header">
            <h1>AI Context Clipboard</h1>
          </header>
          <main className="app-main">
            <CommandPalette
              onQuickPaste={handleQuickPaste}
              onOpenDetail={setSelectedId}
              onRunCommand={handlePaletteCommand}
              onHide={hideWindow}
            />
          </main>
        </>
      )}
    </div>
  );
}
