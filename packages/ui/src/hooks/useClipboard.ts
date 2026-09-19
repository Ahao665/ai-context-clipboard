import { useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { detectContent } from '@ai-clipboard/core';
import { useClipboardStore } from '../stores/clipboard-store';
import {
  listEntries,
  searchEntries,
  findEntryByHash,
  saveEntry,
  getSetting,
} from '../lib/tauri-api';
import { buildPreview } from '../lib/entry-preview';
import type { ClipboardEntry } from '@ai-clipboard/types';

interface ClipboardEventPayload {
  text?: string;
  content_hash: string;
}

/** How many recent entries are held in memory for browsing. */
const HISTORY_WINDOW = 200;

export function useClipboard() {
  const { setEntries, addEntry, setLoading, contentType } = useClipboardStore();
  const skipSensitiveRef = useRef(false);

  /**
   * Reload the browse window. When a type filter is active this goes through
   * `search_entries` (which accepts a content_type filter and, with an empty
   * query, returns the recent list) so the list, the selection index and the
   * palette all see the same filtered set.
   */
  const refreshEntries = useCallback(async () => {
    setLoading(true);
    try {
      const entries = contentType
        ? await searchEntries('', HISTORY_WINDOW, 0, contentType)
        : await listEntries(HISTORY_WINDOW, 0);
      setEntries(entries);
    } finally {
      setLoading(false);
    }
  }, [setEntries, setLoading, contentType]);

  useEffect(() => {
    void refreshEntries();
  }, [refreshEntries]);

  // Track the privacy preference so captures can honour it without an IPC call
  // per clipboard event. Re-read whenever the window regains focus, which is
  // when a settings change is most likely to have just happened.
  useEffect(() => {
    const loadPreference = async () => {
      try {
        skipSensitiveRef.current = (await getSetting('privacy.skip_sensitive')) === 'true';
      } catch {
        skipSensitiveRef.current = false;
      }
    };
    void loadPreference();

    let unlisten: (() => void) | null = null;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
      getCurrentWindow()
        .onFocusChanged(({ payload: focused }) => {
          if (focused) void loadPreference();
        })
        .then((fn) => {
          unlisten = fn;
        }),
    );

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<ClipboardEventPayload>('clipboard:changed', async (event) => {
      const { text, content_hash } = event.payload;
      if (!text || !text.trim()) return;

      // Dedup: the watcher already suppresses repeats within a session, but a
      // hash may have been captured in a previous run.
      const existing = await findEntryByHash(content_hash);
      if (existing) return;

      const detection = detectContent(text);

      // Honour the "skip sensitive content" preference. Applied before saving so
      // the credential never reaches the database.
      if (detection.sensitive && skipSensitiveRef.current) return;

      const now = Date.now();
      const entry: ClipboardEntry = {
        id: crypto.randomUUID(),
        content_hash,
        content_type: detection.contentType,
        subtype: detection.subtype,
        content: text,
        content_preview: buildPreview(text),
        content_storage: 'inline',
        content_size: text.length,
        source_app: undefined,
        source_window: undefined,
        is_deleted: false,
        created_at: now,
        updated_at: now,
      };

      await saveEntry(entry);

      // With a type filter active, only surface the entry if it matches —
      // otherwise the visible list would contradict the selected filter.
      if (!contentType || detection.contentType === contentType) {
        addEntry(entry);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [addEntry, contentType]);

  return { refreshEntries };
}
