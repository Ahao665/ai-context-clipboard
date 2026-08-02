import { useEffect, useRef } from 'react';
import { composePaletteResults } from '@ai-clipboard/core';
import { useClipboardStore } from '../stores/clipboard-store';
import { createPaletteSearchController } from './palette-search-controller';

const DEBOUNCE_MS = 150;

/** Debounced palette search: query → 150ms → composePaletteResults → store. */
export function usePaletteSearch() {
  const query = useClipboardStore((s) => s.query);
  const entries = useClipboardStore((s) => s.entries);
  const paletteNonce = useClipboardStore((s) => s.paletteNonce);
  const setResults = useClipboardStore((s) => s.setResults);
  const setIsSearching = useClipboardStore((s) => s.setIsSearching);

  const controllerRef = useRef<ReturnType<typeof createPaletteSearchController> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createPaletteSearchController(composePaletteResults, DEBOUNCE_MS);
  }

  useEffect(() => {
    const controller = controllerRef.current!;
    controller.schedule(query, entries, {
      onResult: setResults,
      onStart: () => setIsSearching(true),
      onDone: () => setIsSearching(false),
    });
    return () => controller.cancel();
  }, [query, entries, paletteNonce, setResults, setIsSearching]);
}
