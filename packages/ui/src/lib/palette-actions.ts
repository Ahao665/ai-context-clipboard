import type {
  ClipboardEntry,
  PaletteCommand,
  PaletteComposeResult,
  PaletteItem,
} from '@ai-clipboard/types';

export const isBrowseMode = (query: string) => query.trim().length === 0;

/** The selectable palette rows: flattened composed groups, or entries when no result yet. */
export function flattenPaletteItems(
  searchResults: PaletteComposeResult | null,
  entries: ClipboardEntry[],
): PaletteItem[] {
  if (searchResults) return searchResults.groups.flatMap((g) => g.items);
  return entries.map((entry, index) => ({ kind: 'entry' as const, entry, score: 1_000_000 - index }));
}

export function resolveSelectedItem(
  selectedIndex: number,
  searchResults: PaletteComposeResult | null,
  entries: ClipboardEntry[],
): PaletteItem | null {
  return flattenPaletteItems(searchResults, entries)[selectedIndex] ?? null;
}

export type PaletteKeyAction =
  | { type: 'move'; delta: 1 | -1 }
  | { type: 'quickPaste'; entry: ClipboardEntry }
  | { type: 'openDetail'; id: string }
  | { type: 'runCommand'; command: PaletteCommand; target: ClipboardEntry | null }
  | { type: 'clearQuery' }
  | { type: 'hide' }
  | { type: 'none' };

/** Pure keyboard decision: given a key + current palette state, returns the action to dispatch. */
export function handlePaletteKey(
  key: string,
  shiftKey: boolean,
  ctx: {
    query: string;
    selectedItem: PaletteItem | null;
    topEntry: ClipboardEntry | null;
    isComposing?: boolean;
  },
): PaletteKeyAction {
  const { query, selectedItem, topEntry, isComposing } = ctx;

  // During IME composition (e.g. Chinese pinyin), Enter commits the candidate text and
  // Esc/arrows manipulate the candidate window — none of these should reach the palette.
  if (isComposing) return { type: 'none' };

  if (key === 'ArrowDown') return { type: 'move', delta: 1 };
  if (key === 'ArrowUp') return { type: 'move', delta: -1 };
  if (key === 'Enter') {
    if (shiftKey) {
      return selectedItem?.kind === 'entry'
        ? { type: 'openDetail', id: selectedItem.entry.id }
        : { type: 'none' };
    }
    if (selectedItem?.kind === 'command') {
      // A highlighted command row means no entry row is selected, so `topEntry`
      // (the best history match) is the correct target. This matches the browse-mode
      // chips, which pass the highlighted entry.
      return { type: 'runCommand', command: selectedItem.command, target: topEntry };
    }
    if (selectedItem?.kind === 'entry') {
      return { type: 'quickPaste', entry: selectedItem.entry };
    }
    return { type: 'none' };
  }
  if (key === 'Escape') {
    return isBrowseMode(query) ? { type: 'hide' } : { type: 'clearQuery' };
  }
  return { type: 'none' };
}
