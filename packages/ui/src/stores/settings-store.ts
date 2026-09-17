import { create } from 'zustand';
import {
  loadAIConfig,
  saveAIConfig,
  checkPrivacyAccepted,
  acceptPrivacy,
  setSetting,
  clearHistory,
  countEntries,
} from '../lib/tauri-api';
import type { AIProviderConfig } from '@ai-clipboard/types';

interface SettingsState {
  aiConfig: AIProviderConfig;
  privacyAccepted: boolean;
  privacyChecked: boolean;
  loading: boolean;
  historyCount: number;
  loadConfig: () => Promise<void>;
  updateConfig: (config: AIProviderConfig) => Promise<void>;
  checkPrivacy: () => Promise<void>;
  acceptPrivacyAction: () => Promise<void>;
  /** Toggle the "ask before send" preference (persisted as inverted `ai_privacy_accepted`). */
  setPrivacyPreference: (askBeforeSend: boolean) => Promise<void>;
  refreshHistoryCount: () => Promise<void>;
  /** Soft-delete every entry. Returns the number removed. */
  clearHistoryAction: () => Promise<number>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  aiConfig: { baseUrl: '', apiKey: '', model: '' },
  privacyAccepted: false,
  privacyChecked: false,
  loading: true,
  historyCount: 0,
  loadConfig: async () => {
    const config = await loadAIConfig();
    set({ aiConfig: config, loading: false });
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
