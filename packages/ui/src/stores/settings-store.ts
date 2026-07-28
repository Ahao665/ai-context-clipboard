import { create } from 'zustand';
import { loadAIConfig, saveAIConfig } from '../lib/tauri-api';
import type { AIProviderConfig } from '@ai-clipboard/types';

interface SettingsState {
  aiConfig: AIProviderConfig;
  loading: boolean;
  loadConfig: () => Promise<void>;
  updateConfig: (config: AIProviderConfig) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  aiConfig: { baseUrl: '', apiKey: '', model: '' },
  loading: true,
  loadConfig: async () => {
    const config = await loadAIConfig();
    set({ aiConfig: config, loading: false });
  },
  updateConfig: async (config) => {
    await saveAIConfig(config);
    set({ aiConfig: config });
  },
}));
