import { Fragment, useCallback, useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PALETTE_COMMANDS } from '@ai-clipboard/core';
import type { ActionId, ClipboardEntry } from '@ai-clipboard/types';
import { useClipboardStore } from '../stores/clipboard-store';
import { usePaletteSearch } from '../hooks/usePaletteSearch';
import { HistoryList } from './HistoryList';
import {
  flattenPaletteItems,
  handlePaletteKey,
  isBrowseMode,
  resolveSelectedItem,
} from '../lib/palette-actions';

const TYPE_ICON: Record<string, string> = {
  text: '📝',
  code: '💻',
  url: '🔗',
  json: '📊',
  email: '✉️',
  unknown: '📋',
};

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RowProps {
  icon: string;
  title: string;
  subtitle: string;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
  onActivate: () => void;
}

function PaletteRow({ icon, title, subtitle, hint, selected, onSelect, onActivate }: RowProps) {
  return (
    <div className={`palette-row ${selected ? 'selected' : ''}`} onClick={onActivate} onMouseEnter={onSelect}>
      <span className="palette-row-icon">{icon}</span>
      <div className="palette-row-body">
        <div className="palette-row-title">{title}</div>
        <div className="palette-row-subtitle">
          {subtitle}
          {hint ? <span className="palette-row-hint">{hint}</span> : null}
        </div>
      </div>
    </div>
  );
}

interface Props {
  onQuickPaste: (entry: ClipboardEntry) => void;
  onOpenDetail: (id: string) => void;
  onRunCommand: (commandId: string, actionId: ActionId, target: ClipboardEntry | null) => void;
  onHide: () => void;
}

export function CommandPalette({ onQuickPaste, onOpenDetail, onRunCommand, onHide }: Props) {
  const { entries, query, searchResults, selectedIndex, isSearching, setQuery, moveSelection } = useClipboardStore();
  const inputRef = useRef<HTMLInputElement>(null);

  usePaletteSearch();

  const browsing = isBrowseMode(query);
  const flat = useMemo(() => flattenPaletteItems(searchResults, entries), [searchResults, entries]);
  const selectedItem = useMemo(
    () => resolveSelectedItem(selectedIndex, searchResults, entries),
    [selectedIndex, searchResults, entries],
  );
  const topEntry = searchResults?.topEntry ?? entries[0] ?? null;
  const browseTarget =
    selectedItem?.kind === 'entry' ? selectedItem.entry : (entries[selectedIndex] ?? entries[0] ?? null);

  // Autofocus on mount and whenever the window regains focus (Alt+Space show).
  useEffect(() => {
    inputRef.current?.focus();
    let disposed = false;
    let unlisten: (() => void) | null = null;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) inputRef.current?.focus();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const action = handlePaletteKey(e.key, e.shiftKey, {
      query,
      selectedItem,
      topEntry,
      isComposing: e.nativeEvent.isComposing,
    });
    switch (action.type) {
      case 'move':
        e.preventDefault();
        moveSelection(action.delta);
        break;
      case 'quickPaste':
        e.preventDefault();
        onQuickPaste(action.entry);
        break;
      case 'openDetail':
        e.preventDefault();
        onOpenDetail(action.id);
        break;
      case 'runCommand':
        e.preventDefault();
        onRunCommand(action.command.id, action.command.actionId, action.target);
        break;
      case 'clearQuery':
        setQuery('');
        break;
      case 'hide':
        onHide();
        break;
      case 'none':
        break;
    }
  };

  const selectByIndex = useCallback(
    (globalIndex: number) => {
      moveSelection(globalIndex - selectedIndex);
    },
    [selectedIndex, moveSelection],
  );

  return (
    <div className="palette">
      <input
        ref={inputRef}
        className="search-input"
        placeholder="输入 AI 命令或搜索剪贴板历史…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      {browsing ? (
        <div className="palette-results">
          <div className="palette-group-title">AI 命令（对选中的条目执行）</div>
          <div className="palette-commands-strip">
            {PALETTE_COMMANDS.map((command) => (
              <button
                key={command.id}
                className="palette-command-chip"
                title={command.description}
                onClick={() => onRunCommand(command.id, command.actionId, browseTarget)}
              >
                🤖 {command.label}
              </button>
            ))}
          </div>
          <div className="palette-group-title">剪贴板历史</div>
          <HistoryList
            onSelect={(id) => {
              const idx = entries.findIndex((e) => e.id === id);
              if (idx >= 0) moveSelection(idx - selectedIndex);
              onOpenDetail(id);
            }}
          />
        </div>
      ) : (
        <div className="palette-results">
          {isSearching ? (
            <div className="palette-status">搜索中…</div>
          ) : (
            <>
              {searchResults?.groups.map((group) => (
            <Fragment key={group.kind}>
              <div className="palette-group-title">{group.title}</div>
              {group.items.map((item) => {
                const globalIndex = flat.indexOf(item);
                const selected = globalIndex === selectedIndex;
                if (item.kind === 'command') {
                  return (
                    <PaletteRow
                      key={`cmd-${item.command.id}`}
                      icon="🤖"
                      title={item.command.label}
                      subtitle={item.command.description}
                      hint={topEntry ? `对「${topEntry.content_preview.slice(0, 20)}…」执行` : '无可用条目'}
                      selected={selected}
                      onSelect={() => selectByIndex(globalIndex)}
                      onActivate={() => onRunCommand(item.command.id, item.command.actionId, topEntry)}
                    />
                  );
                }
                return (
                  <PaletteRow
                    key={`ent-${item.entry.id}`}
                    icon={TYPE_ICON[item.entry.content_type] || '📋'}
                    title={item.entry.content_preview || '(empty)'}
                    subtitle={formatTime(item.entry.created_at)}
                    hint="Enter 复制"
                    selected={selected}
                    onSelect={() => selectByIndex(globalIndex)}
                    onActivate={() => onQuickPaste(item.entry)}
                  />
                );
              })}
            </Fragment>
          ))}
              {(!searchResults || searchResults.groups.length === 0) && (
                <div className="history-status">无匹配结果</div>
              )}
            </>
          )}
        </div>
      )}

      <div className="palette-footer">
        {browsing
          ? 'Enter 复制 · Shift+Enter 打开 · 输入命令启动 AI · Esc 关闭'
          : '↑↓ 选择 · Enter 复制/执行 · Shift+Enter 打开 · Esc 清空'}
      </div>
    </div>
  );
}
