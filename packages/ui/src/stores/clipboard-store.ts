import { create } from 'zustand';
import type {
  ClipboardEntry,
  ContentType,
  PaletteComposeResult,
  PaletteItem,
} from '@ai-clipboard/types';

const clampIndex = (index: number, length: number) =>
  length === 0 ? 0 : Math.max(0, Math.min(index, length - 1));

const cycleIndex = (index: number, delta: number, length: number) => {
  if (length === 0) return 0;
  return (((index + delta) % length) + length) % length;
};

const flattenItems = (result: PaletteComposeResult | null): PaletteItem[] =>
  result ? result.groups.flatMap((g) => g.items) : [];

/**
 * Mirror the backend's ordering: pinned first, then newest first.
 * Kept in sync with the SQL `ORDER BY is_pinned DESC, created_at DESC`.
 */
const sortEntries = (entries: ClipboardEntry[]): ClipboardEntry[] =>
  [...entries].sort((a, b) => {
    const pinDiff = Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned));
    return pinDiff !== 0 ? pinDiff : b.created_at - a.created_at;
  });

/** A transient message shown over the panel (skipped capture, truncation, …). */
export interface AppNotice {
  /** Bumped on every show so the auto-dismiss timer restarts. */
  id: number;
  kind: 'info' | 'warn';
  text: string;
}

interface ClipboardState {
  entries: ClipboardEntry[];
  loading: boolean;
  selectedIndex: number;
  selectedId: string | null;
  query: string;
  /** Active content-type filter, or null for "all types". */
  contentType: ContentType | null;
  searchResults: PaletteComposeResult | null;
  isSearching: boolean;
  paletteNonce: number;
  notice: AppNotice | null;
  setEntries: (entries: ClipboardEntry[]) => void;
  addEntry: (entry: ClipboardEntry) => void;
  removeEntry: (id: string) => void;
  setPinned: (id: string, isPinned: boolean) => void;
  setLoading: (loading: boolean) => void;
  setQuery: (query: string) => void;
  setContentType: (contentType: ContentType | null) => void;
  setResults: (results: PaletteComposeResult) => void;
  setIsSearching: (isSearching: boolean) => void;
  moveSelection: (delta: number) => void;
  resetPalette: () => void;
  showNotice: (text: string, kind?: AppNotice['kind']) => void;
  dismissNotice: () => void;
}

export const useClipboardStore = create<ClipboardState>((set) => {
  const syncSelection = (
    entries: ClipboardEntry[],
    selectedIndex: number,
    searchResults: PaletteComposeResult | null,
  ) => {
    const items = flattenItems(searchResults);
    const length = searchResults !== null ? items.length : entries.length;
    const index = clampIndex(selectedIndex, length);
    let selectedId: string | null = null;
    if (searchResults !== null) {
      const item = items[index];
      selectedId = item?.kind === 'entry' ? item.entry.id : null;
    } else {
      selectedId = entries[index]?.id ?? null;
    }
    return { selectedIndex: index, selectedId };
  };

  return {
    entries: [],
    loading: false,
    selectedIndex: 0,
    selectedId: null,
    query: '',
    contentType: null,
    searchResults: null,
    isSearching: false,
    paletteNonce: 0,
    notice: null,

    setEntries: (entries) =>
      set((s) => ({ entries, ...syncSelection(entries, s.selectedIndex, s.searchResults) })),
    addEntry: (entry) =>
      set((s) => {
        // Re-sort rather than blindly prepending so a new capture lands below
        // any pinned entries, matching the backend ordering.
        const entries = sortEntries([entry, ...s.entries]).slice(0, 500);
        return { entries, ...syncSelection(entries, s.selectedIndex, s.searchResults) };
      }),
    removeEntry: (id) =>
      set((s) => {
        const entries = s.entries.filter((e) => e.id !== id);
        return { entries, ...syncSelection(entries, s.selectedIndex, s.searchResults) };
      }),
    setPinned: (id, isPinned) =>
      set((s) => {
        const entries = sortEntries(
          s.entries.map((e) => (e.id === id ? { ...e, is_pinned: isPinned } : e)),
        );
        return { entries, ...syncSelection(entries, s.selectedIndex, s.searchResults) };
      }),
    setLoading: (loading) => set({ loading }),

    setQuery: (query) => set({ query }),
    setContentType: (contentType) => set({ contentType }),
    setResults: (results) =>
      set((s) => {
        const items = flattenItems(results);
        const index = clampIndex(s.selectedIndex, items.length);
        const item = items[index];
        return {
          searchResults: results,
          selectedIndex: index,
          selectedId: item?.kind === 'entry' ? item.entry.id : null,
        };
      }),
    setIsSearching: (isSearching) => set({ isSearching }),
    moveSelection: (delta) =>
      set((s) => {
        const items = flattenItems(s.searchResults);
        const length = s.searchResults !== null ? items.length : s.entries.length;
        const index = cycleIndex(s.selectedIndex, delta, length);
        const item = items[index];
        return {
          selectedIndex: index,
          selectedId:
            s.searchResults !== null
              ? item?.kind === 'entry'
                ? item.entry.id
                : null
              : (s.entries[index]?.id ?? null),
        };
      }),
    resetPalette: () =>
      set((s) => ({
        query: '',
        searchResults: null,
        isSearching: false,
        selectedIndex: 0,
        selectedId: null,
        paletteNonce: s.paletteNonce + 1,
      })),
    showNotice: (text, kind = 'info') =>
      set((s) => ({ notice: { id: (s.notice?.id ?? 0) + 1, kind, text } })),
    dismissNotice: () => set({ notice: null }),
  };
});
