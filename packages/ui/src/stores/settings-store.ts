import { create } from 'zustand';
import {
  loadAIConfig,
  saveAIConfig,
  checkPrivacyAccepted,
  acceptPrivacy,
} from '../lib/tauri-api';
import type { AIProviderConfig } from '@ai-clipboard/types';

interface SettingsState {
  aiConfig: AIProviderConfig;
  privacyAccepted: boolean;
  privacyChecked: boolean;
  loading: boolean;
  loadConfig: () => Promise<void>;
  updateConfig: (config: AIProviderConfig) => Promise<void>;
  checkPrivacy: () => Promise<void>;
  acceptPrivacyAction: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  aiConfig: { baseUrl: '', apiKey: '', model: '' },
  privacyAccepted: false,
  privacyChecked: false,
  loading: true,
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
}));
