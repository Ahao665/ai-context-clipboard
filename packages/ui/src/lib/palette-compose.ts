import {
  buildPaletteResult,
  filterByType,
  matchCommands,
  orderEntries,
  rankEntriesByQuery,
} from '@ai-clipboard/core';
import type { ClipboardEntry, ContentType, PaletteComposeResult } from '@ai-clipboard/types';

/** Backend search call — injected so this module stays free of Tauri imports. */
export type SearchFn = (
  query: string,
  limit: number,
  offset: number,
  contentType?: ContentType,
) => Promise<ClipboardEntry[]>;

/** How many matches to pull from the index per keystroke. */
export const SEARCH_LIMIT = 200;

export type ComposeFn = (
  query: string,
  entries: ClipboardEntry[],
) => PaletteComposeResult | Promise<PaletteComposeResult>;

/**
 * Compose palette results using the backend full-text index.
 *
 * Why this exists: the in-memory composer only sees the entries currently held
 * in the store (a few hundred at most), so older history was unsearchable. Here
 * the FTS5 index decides which entries match across the *whole* history, and the
 * local fuzzy matcher re-ranks those hits for relevance.
 *
 * Browse mode (empty query) stays local — it needs the recent window in order,
 * and hitting the database on every palette open would be wasteful.
 *
 * `getContentType` is a getter rather than a value so the composer can be
 * created once while still observing the current type filter.
 */
export function createRemotePaletteComposer(
  search: SearchFn,
  getContentType: () => ContentType | null,
): ComposeFn {
  return async (query, entries) => {
    const trimmed = query.trim();
    const contentType = getContentType();

    if (!trimmed) {
      // Browse mode: filter the in-memory recent window, no backend round trip.
      return buildPaletteResult([], orderEntries(filterByType(entries, contentType)));
    }

    const commandItems = matchCommands(trimmed);

    let found: ClipboardEntry[];
    try {
      found = await search(trimmed, SEARCH_LIMIT, 0, contentType ?? undefined);
    } catch {
      // The index is an optimisation, not a requirement: degrade to searching
      // the loaded window so typing never appears to break.
      found = filterByType(entries, contentType).filter((entry) => {
        const text = `${entry.content ?? ''} ${entry.content_preview ?? ''}`.toLowerCase();
        return text.includes(trimmed.toLowerCase());
      });
    }

    return buildPaletteResult(commandItems, rankEntriesByQuery(trimmed, found));
  };
}
