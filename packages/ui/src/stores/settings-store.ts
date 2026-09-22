import { create } from 'zustand';
import {
  loadAIConfig,
  saveAIConfig,
  checkPrivacyAccepted,
  acceptPrivacy,
  setSetting,
  getSetting,
  clearHistory,
  countEntries,
  loadShortcut,
  setShortcut,
} from '../lib/tauri-api';
import type { AIProviderConfig } from '@ai-clipboard/types';

interface SettingsState {
  aiConfig: AIProviderConfig;
  privacyAccepted: boolean;
  privacyChecked: boolean;
  /** When on, captures that look like credentials are not stored at all. */
  skipSensitive: boolean;
  /** Current panel-toggle binding, e.g. `Alt+Space`. */
  shortcut: string;
  loading: boolean;
  historyCount: number;
  loadConfig: () => Promise<void>;
  updateConfig: (config: AIProviderConfig) => Promise<void>;
  checkPrivacy: () => Promise<void>;
  acceptPrivacyAction: () => Promise<void>;
  /** Toggle the "ask before send" preference (persisted as inverted `ai_privacy_accepted`). */
  setPrivacyPreference: (askBeforeSend: boolean) => Promise<void>;
  /** Toggle the "skip sensitive content" preference. */
  setSkipSensitivePreference: (skip: boolean) => Promise<void>;
  /** Rebind the panel shortcut. Resolves with the binding that is now live. */
  setShortcutAction: (spec: string) => Promise<string>;
  refreshHistoryCount: () => Promise<void>;
  /** Soft-delete every entry. Returns the number removed. */
  clearHistoryAction: () => Promise<number>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  aiConfig: { baseUrl: '', apiKey: '', model: '' },
  privacyAccepted: false,
  privacyChecked: false,
  skipSensitive: false,
  shortcut: '',
  loading: true,
  historyCount: 0,
  loadConfig: async () => {
    const [config, shortcut, skipSensitive] = await Promise.all([
      loadAIConfig(),
      loadShortcut(),
      getSetting('privacy.skip_sensitive').then((v) => v === 'true').catch(() => false),
    ]);
    set({ aiConfig: config, shortcut, skipSensitive, loading: false });
  },
  updateConfig: async (config) => {
    await saveAIConfig(config);
    set({ aiConfig: config });
  },
  checkPrivacy: async () => {
    const accepted = await checkPrivacyAccepted();
    set({ privacyAccepted: accepted, privacyChecked: true });
  },
  acceptPrivacyAction: async () => {
    await acceptPrivacy();
    set({ privacyAccepted: true });
  },
  setPrivacyPreference: async (askBeforeSend) => {
    // "ask before send" on  → ai_privacy_accepted = false
    // "ask before send" off → ai_privacy_accepted = true  (never ask again)
    if (askBeforeSend) {
      await setSetting('ai_privacy_accepted', 'false');
      set({ privacyAccepted: false });
    } else {
      await acceptPrivacy();
      set({ privacyAccepted: true });
    }
  },
  setSkipSensitivePreference: async (skip) => {
    await setSetting('privacy.skip_sensitive', String(skip));
    set({ skipSensitive: skip });
  },
  setShortcutAction: async (spec) => {
    const applied = await setShortcut(spec);
    set({ shortcut: applied });
    return applied;
  },
  refreshHistoryCount: async () => {
    try {
      const count = await countEntries();
      set({ historyCount: count });
    } catch {
      // Storage unavailable (e.g. UI rendered outside Tauri) — leave unchanged.
    }
  },
  clearHistoryAction: async () => {
    const removed = await clearHistory();
    set({ historyCount: 0 });
    return removed;
  },
}));
