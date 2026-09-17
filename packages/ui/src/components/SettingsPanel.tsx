import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import {
  PROVIDER_PRESETS,
  matchPreset,
  validateAIConfig,
  isConfigUsable,
} from '../lib/provider-presets';
import type { AIProviderConfig } from '@ai-clipboard/types';

interface Props {
  onClose: () => void;
}

const SHORTCUT_LABEL = 'Alt+Space';

export function SettingsPanel({ onClose }: Props) {
  const {
    aiConfig,
    privacyAccepted,
    updateConfig,
    setPrivacyPreference,
    historyCount,
    refreshHistoryCount,
    clearHistoryAction,
  } = useSettingsStore();

  const [draft, setDraft] = useState<AIProviderConfig>(aiConfig);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-sync the draft whenever the underlying config changes (e.g. first load).
  useEffect(() => {
    setDraft(aiConfig);
  }, [aiConfig]);

  useEffect(() => {
    void refreshHistoryCount();
  }, [refreshHistoryCount]);

  const activePreset = useMemo(() => matchPreset(draft), [draft]);
  const errors = useMemo(() => validateAIConfig(draft), [draft]);
  const usable = useMemo(() => isConfigUsable(draft), [draft]);

  const applyPreset = (presetId: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === presetId);
    if (!preset || preset.id === 'custom') {
      setDraft((d) => ({ ...d, baseUrl: '', model: '' }));
      return;
    }
    setDraft((d) => ({ ...d, baseUrl: preset.baseUrl, model: preset.model }));
  };

  const handleSave = async () => {
    if (errors.length > 0) {
      setStatus({ kind: 'error', text: errors[0] });
      return;
    }
    setBusy(true);
    try {
      await updateConfig({
        ...draft,
        baseUrl: draft.baseUrl.trim(),
        model: draft.model.trim(),
        apiKey: draft.apiKey.trim(),
      });
      setStatus({ kind: 'ok', text: '已保存' });
    } catch {
      setStatus({ kind: 'error', text: '保存失败，请重试' });
    } finally {
      setBusy(false);
    }
  };

  const handleClearHistory = async () => {
    setBusy(true);
    try {
      const removed = await clearHistoryAction();
      setStatus({ kind: 'ok', text: `已清空 ${removed} 条历史记录` });
      setConfirmClear(false);
    } catch {
      setStatus({ kind: 'error', text: '清空失败，请重试' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={onClose} aria-label="关闭设置">
            ✕
          </button>
        </header>

        <div className="settings-body">
          {/* --- AI provider --- */}
          <section className="settings-section">
            <h3>AI 服务</h3>
            <p className="settings-hint">
              兼容 OpenAI Chat Completions 协议。密钥仅保存在本机数据库，不会上传。
            </p>

            <label className="settings-field">
              <span>服务商</span>
              <div className="settings-presets">
                {PROVIDER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`preset-chip ${activePreset === preset.id ? 'active' : ''}`}
                    onClick={() => applyPreset(preset.id)}
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </label>

            <label className="settings-field">
              <span>API 地址</span>
              <input
                type="text"
                value={draft.baseUrl}
                placeholder="https://api.deepseek.com/v1"
                spellCheck={false}
                onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
              />
            </label>

            <label className="settings-field">
              <span>模型</span>
              <input
                type="text"
                value={draft.model}
                placeholder="deepseek-chat"
                spellCheck={false}
                onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
              />
            </label>

            <label className="settings-field">
              <span>API Key</span>
              <div className="settings-key-row">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={draft.apiKey}
                  placeholder="sk-…"
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                />
                <button
                  type="button"
                  className="settings-key-toggle"
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? '隐藏' : '显示'}
                </button>
              </div>
            </label>

            {!usable && errors.length === 0 && (
              <p className="settings-warn">尚未填写 API Key — AI 功能暂不可用。</p>
            )}
            {errors.map((err) => (
              <p className="settings-warn" key={err}>
                {err}
              </p>
            ))}

            <div className="settings-actions">
              <button className="confirm-btn" onClick={handleSave} disabled={busy}>
                保存
              </button>
              {status && (
                <span className={`settings-status ${status.kind}`}>{status.text}</span>
              )}
            </div>
          </section>

          {/* --- Privacy --- */}
          <section className="settings-section">
            <h3>隐私</h3>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={!privacyAccepted}
                onChange={(e) => void setPrivacyPreference(!e.target.checked)}
              />
              <span>
                每次 AI 调用前询问
                <em className="settings-sub">
                  开启后会先展示将要发送的内容，确认后才请求 API
                </em>
              </span>
            </label>
          </section>

          {/* --- History --- */}
          <section className="settings-section">
            <h3>历史记录</h3>
            <p className="settings-hint">
              当前保存 <strong>{historyCount}</strong> 条记录。
            </p>
            {confirmClear ? (
              <div className="settings-actions">
                <span className="settings-warn">确认清空全部剪贴板历史？此操作不可撤销。</span>
                <button className="danger-btn" onClick={handleClearHistory} disabled={busy}>
                  确认清空
                </button>
                <button className="cancel-btn" onClick={() => setConfirmClear(false)} disabled={busy}>
                  取消
                </button>
              </div>
            ) : (
              <div className="settings-actions">
                <button
                  className="cancel-btn"
                  onClick={() => setConfirmClear(true)}
                  disabled={historyCount === 0}
                >
                  清空历史记录
                </button>
              </div>
            )}
          </section>

          {/* --- Shortcut --- */}
          <section className="settings-section">
            <h3>快捷键</h3>
            <div className="settings-kbd-row">
              <kbd>{SHORTCUT_LABEL}</kbd>
              <span>显示 / 隐藏面板</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
