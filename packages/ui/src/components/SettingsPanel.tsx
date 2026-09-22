import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import {
  PROVIDER_PRESETS,
  matchPreset,
  validateAIConfig,
  isConfigUsable,
} from '../lib/provider-presets';
import { buildShortcutSpec } from '../lib/shortcut-spec';
import { clearShortcut, DEFAULT_SHORTCUT } from '../lib/tauri-api';
import type { AIProviderConfig } from '@ai-clipboard/types';

interface Props {
  onClose: () => void;
}

type Status = { kind: 'ok' | 'error'; text: string } | null;

export function SettingsPanel({ onClose }: Props) {
  const {
    aiConfig,
    privacyAccepted,
    skipSensitive,
    shortcut,
    loadConfig,
    updateConfig,
    setPrivacyPreference,
    setSkipSensitivePreference,
    setShortcutAction,
    historyCount,
    refreshHistoryCount,
    clearHistoryAction,
  } = useSettingsStore();

  const [draft, setDraft] = useState<AIProviderConfig>(aiConfig);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordHint, setRecordHint] = useState<string | null>(null);
  const [shortcutStatus, setShortcutStatus] = useState<Status>(null);
  const recorderRef = useRef<HTMLDivElement>(null);

  // Re-sync the draft whenever the underlying config changes (e.g. first load).
  useEffect(() => {
    setDraft(aiConfig);
  }, [aiConfig]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void refreshHistoryCount();
  }, [refreshHistoryCount]);

  // The recorder needs keyboard focus to receive the combination.
  useEffect(() => {
    if (recording) recorderRef.current?.focus();
  }, [recording]);

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

  // --- Shortcut recording --------------------------------------------------

  const startRecording = async () => {
    setShortcutStatus(null);
    setRecordHint(null);
    setRecording(true);
    // Release the live binding first, otherwise pressing the *current*
    // combination would toggle the window instead of being captured.
    try {
      await clearShortcut();
    } catch {
      // Non-fatal: worst case the current combination still toggles the window.
    }
  };

  /** Leave recording mode, putting the stored binding back on the way out. */
  const stopRecording = async () => {
    setRecording(false);
    setRecordHint(null);
    try {
      await setShortcutAction(shortcut);
    } catch {
      // The value is still persisted and is re-applied on the next launch.
    }
  };

  const applyShortcut = async (spec: string) => {
    setBusy(true);
    try {
      const applied = await setShortcutAction(spec);
      setShortcutStatus({ kind: 'ok', text: `已改为 ${applied}` });
      setRecording(false);
      setRecordHint(null);
    } catch (err) {
      // `register` already restored the previous binding, so leaving recording
      // mode is safe and lets the user see the error.
      setShortcutStatus({
        kind: 'error',
        text: typeof err === 'string' ? err : '快捷键设置失败',
      });
      setRecording(false);
    } finally {
      setBusy(false);
    }
  };

  const handleRecordKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Never let the combination reach the input or the global handler.
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      void stopRecording();
      return;
    }

    const result = buildShortcutSpec(e);
    if (!result.ok) {
      setRecordHint(result.message);
      return;
    }
    setRecordHint(null);
    void applyShortcut(result.spec);
  };

  /**
   * Close the panel, putting the binding back if recording was interrupted.
   *
   * Without this, closing the panel mid-recording would leave the shortcut
   * unregistered until the next launch — `clear_shortcut` has already run and
   * nothing would restore it.
   */
  const handleClose = () => {
    if (recording) void stopRecording();
    onClose();
  };

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="settings-header">
          <h2>设置</h2>
          <button className="settings-close" onClick={handleClose} aria-label="关闭设置">
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
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={skipSensitive}
                onChange={(e) => void setSkipSensitivePreference(e.target.checked)}
              />
              <span>
                跳过疑似敏感内容
                <em className="settings-sub">
                  看起来像密钥、令牌或密码的复制不会写进数据库，面板上会提示一次
                </em>
              </span>
            </label>
          </section>

          {/* --- History --- */}
          <section className="settings-section">
            <h3>历史记录</h3>
            <p className="settings-hint">
              当前保存 <strong>{historyCount}</strong> 条记录。单条记录可以在列表里直接删除。
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
            {recording ? (
              <div
                ref={recorderRef}
                className="shortcut-recorder"
                tabIndex={0}
                role="button"
                aria-label="按下新的快捷键组合"
                onKeyDown={handleRecordKeyDown}
              >
                按下新的组合键…
                <em className="settings-sub">至少含 Ctrl / Alt / Shift 之一，Esc 取消</em>
              </div>
            ) : (
              <div className="settings-kbd-row">
                <kbd>{shortcut || DEFAULT_SHORTCUT}</kbd>
                <span>显示 / 隐藏面板</span>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => void startRecording()}
                  disabled={busy}
                >
                  修改
                </button>
              </div>
            )}
            {recordHint && <p className="settings-hint">{recordHint}</p>}
            {shortcutStatus && (
              <p className={shortcutStatus.kind === 'error' ? 'settings-warn' : 'settings-status ok'}>
                {shortcutStatus.text}
              </p>
            )}
            <p className="settings-hint">
              被其他程序占用时会设置失败并保留原来的按键。关闭窗口不会退出程序，可以从托盘菜单退出。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
