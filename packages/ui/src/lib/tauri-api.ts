import { invoke } from '@tauri-apps/api/core';
import type { ClipboardEntry, AIProviderConfig } from '@ai-clipboard/types';

// --- Clipboard ---

export async function saveEntry(entry: ClipboardEntry): Promise<void> {
  await invoke('save_entry', { entry });
}

export async function listEntries(
  limit?: number,
  offset?: number,
): Promise<ClipboardEntry[]> {
  return invoke('list_entries', { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function searchEntries(
  query: string,
  limit?: number,
): Promise<ClipboardEntry[]> {
  return invoke('search_entries', { query, limit: limit ?? 50 });
}

export async function deleteEntry(id: string): Promise<void> {
  await invoke('delete_entry', { id });
}

export async function findEntryByHash(
  hash: string,
): Promise<ClipboardEntry | null> {
  return invoke('find_by_hash', { hash });
}

// --- Settings ---

export async function getSetting(key: string): Promise<string | null> {
  return invoke('get_setting', { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  await invoke('set_setting', { key, value });
}

// --- AI Config helpers ---

export async function loadAIConfig(): Promise<AIProviderConfig> {
  const [baseUrl, apiKey, model] = await Promise.all([
    getSetting('ai.base_url'),
    getSetting('ai.api_key'),
    getSetting('ai.model'),
  ]);
  return {
    baseUrl: baseUrl || 'https://api.openai.com/v1',
    apiKey: apiKey || '',
    model: model || 'gpt-4o-mini',
  };
}

export async function saveAIConfig(config: AIProviderConfig): Promise<void> {
  await Promise.all([
    setSetting('ai.base_url', config.baseUrl),
    setSetting('ai.api_key', config.apiKey),
    setSetting('ai.model', config.model),
  ]);
}

// --- Privacy ---

export async function checkPrivacyAccepted(): Promise<boolean> {
  const val = await getSetting('ai_privacy_accepted');
  return val === 'true';
}

export async function acceptPrivacy(): Promise<void> {
  await setSetting('ai_privacy_accepted', 'true');
}
