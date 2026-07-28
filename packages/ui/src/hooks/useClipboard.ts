import { useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useClipboardStore } from '../stores/clipboard-store';
import { listEntries, findEntryByHash, saveEntry } from '../lib/tauri-api';

interface ClipboardEventPayload {
  text?: string;
  content_hash: string;
}

export function useClipboard() {
  const { setEntries, addEntry, setLoading } = useClipboardStore();

  const refreshEntries = useCallback(async () => {
    setLoading(true);
    const entries = await listEntries(50, 0);
    setEntries(entries);
    setLoading(false);
  }, [setEntries, setLoading]);

  useEffect(() => {
    refreshEntries();

    let unlisten: (() => void) | null = null;

    listen<ClipboardEventPayload>('clipboard:changed', async (event) => {
      const { text, content_hash } = event.payload;
      if (!text || !text.trim()) return;

      // Dedup: check if already saved
      const existing = await findEntryByHash(content_hash);
      if (existing) return;

      const now = Date.now();
      const entry = {
        id: crypto.randomUUID(),
        content_hash,
        content_type: 'text' as const,
        content: text,
        content_preview: text.slice(0, 200),
        content_storage: 'inline' as const,
        content_size: text.length,
        source_app: undefined,
        source_window: undefined,
        is_deleted: false,
        created_at: now,
        updated_at: now,
      };

      await saveEntry(entry);
      addEntry(entry);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [refreshEntries, addEntry]);

  return { refreshEntries };
}
