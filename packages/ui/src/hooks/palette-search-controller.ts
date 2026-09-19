import type { ClipboardEntry, PaletteComposeResult } from '@ai-clipboard/types';
import type { ComposeFn } from '../lib/palette-compose';

// Re-exported for convenience; the canonical definition lives next to the
// composers so the controller and its callers cannot drift apart.
export type { ComposeFn };

export interface PaletteSearchCallbacks {
  onResult: (result: PaletteComposeResult) => void;
  onStart?: () => void;
  onDone?: () => void;
}

export interface PaletteSearchController {
  schedule: (query: string, entries: ClipboardEntry[], callbacks: PaletteSearchCallbacks) => void;
  cancel: () => void;
}

/** Debounced compose with a request-sequence guard: only the newest schedule's result is applied. */
export function createPaletteSearchController(
  compose: ComposeFn,
  delayMs = 150,
): PaletteSearchController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;

  return {
    schedule(query, entries, { onResult, onStart, onDone }) {
      const id = ++seq;
      onStart?.();
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(async () => {
        timer = null;
        const result = await compose(query, entries);
        if (id === seq) {
          onResult(result);
          onDone?.();
        }
      }, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      seq++; // invalidate any in-flight compose
    },
  };
}
