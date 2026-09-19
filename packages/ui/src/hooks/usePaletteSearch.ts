import { useEffect, useMemo, useRef } from 'react';
import { useClipboardStore } from '../stores/clipboard-store';
import { createPaletteSearchController } from './palette-search-controller';
import { createRemotePaletteComposer } from '../lib/palette-compose';
import { searchEntries } from '../lib/tauri-api';

const DEBOUNCE_MS = 150;

/**
 * Debounced palette search.
 *
 * Queries go through the backend FTS5 index (covering the entire history rather
 * than only the loaded window); browse mode stays in-memory. The debounce plus
 * the controller's sequence guard keep rapid typing from applying stale results.
 */
export function usePaletteSearch() {
  const query = useClipboardStore((s) => s.query);
  const entries = useClipboardStore((s) => s.entries);
  const contentType = useClipboardStore((s) => s.contentType);
  const paletteNonce = useClipboardStore((s) => s.paletteNonce);
  const setResults = useClipboardStore((s) => s.setResults);
  const setIsSearching = useClipboardStore((s) => s.setIsSearching);

  // The composer is created once but must observe the live filter value.
  const contentTypeRef = useRef(contentType);
  contentTypeRef.current = contentType;

  const controllerRef = useRef<ReturnType<typeof createPaletteSearchController> | null>(null);
  if (controllerRef.current === null) {
    const composer = createRemotePaletteComposer(searchEntries, () => contentTypeRef.current);
    controllerRef.current = createPaletteSearchController(composer, DEBOUNCE_MS);
  }

  useEffect(() => {
    const controller = controllerRef.current!;
    controller.schedule(query, entries, {
      onResult: setResults,
      onStart: () => setIsSearching(true),
      onDone: () => setIsSearching(false),
    });
    return () => controller.cancel();
  }, [query, entries, contentType, paletteNonce, setResults, setIsSearching]);
}
