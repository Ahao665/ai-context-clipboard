import { invoke } from '@tauri-apps/api/core';
import type { ClipboardEntry, AIProviderConfig, ContentType } from '@ai-clipboard/types';

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
  offset?: number,
  contentType?: ContentType,
): Promise<ClipboardEntry[]> {
  return invoke('search_entries', {
    query,
    limit: limit ?? 50,
    offset: offset ?? 0,
    contentType,
  });
}

export async function deleteEntry(id: string): Promise<void> {
  await invoke('delete_entry', { id });
}

/** Flip an entry's pinned state. Returns the new state. */
export async function togglePin(id: string): Promise<boolean> {
  return invoke('toggle_pin', { id });
}

/** Soft-delete every non-deleted entry and purge the FTS index. Returns rows removed. */
export async function clearHistory(): Promise<number> {
  return invoke('clear_history');
}

/** Hard-delete soft-deleted rows + their FTS entries, then VACUUM. Returns rows purged. */
export async function purgeDeleted(): Promise<number> {
  return invoke('purge_deleted');
}

/** Total number of live (non-deleted) entries — used for the settings footer. */
export async function countEntries(): Promise<number> {
  return invoke('count_entries');
}

/** Most recent live entry, or null when history is empty. */
export async function latestEntry(): Promise<ClipboardEntry | null> {
  return invoke('latest_entry');
}

export async function findEntryByHash(
  hash: string,
): Promise<ClipboardEntry | null> {
  return invoke('find_by_hash', { hash });
}

export async function setClipboard(content: string): Promise<void> {
  await invoke('set_clipboard', { content });
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

// --- Shortcut ---

/** Settings key holding the panel-toggle binding. */
export const SHORTCUT_SETTING_KEY = 'shortcut.panel';

/** Fallback binding, mirroring `DEFAULT_SHORTCUT` in the Rust layer. */
export const DEFAULT_SHORTCUT = 'Alt+Space';

export async function loadShortcut(): Promise<string> {
  const stored = await getSetting(SHORTCUT_SETTING_KEY);
  return stored?.trim() ? stored : DEFAULT_SHORTCUT;
}

/**
 * Rebind the panel shortcut. Rejects (with a message from the OS) when the
 * combination is already owned by another program.
 */
export async function setShortcut(shortcut: string): Promise<string> {
  return invoke('set_shortcut', { shortcut });
}

/**
 * Release the panel shortcut without changing the stored value.
 *
 * Used while recording a new binding so that pressing the current combination
 * is captured by the panel instead of toggling the window.
 */
export async function clearShortcut(): Promise<void> {
  await invoke('clear_shortcut');
}
