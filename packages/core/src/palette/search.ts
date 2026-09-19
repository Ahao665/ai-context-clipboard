import { fuzzyMatch } from './fuzzy';
import { PALETTE_COMMANDS } from './commands';
import type {
  ClipboardEntry,
  ContentType,
  PaletteCommand,
  PaletteComposeResult,
  PaletteGroup,
  PaletteItem,
} from '@ai-clipboard/types';

/** Score assigned to browse-mode entries, which keep their incoming (recency) order. */
const BROWSE_SCORE_BASE = 1_000_000;

/**
 * Fuzzy-match the AI commands against a query, best first.
 * Returns an empty array for an empty query — commands are only offered once
 * the user starts typing, so browse mode stays uncluttered.
 */
export function matchCommands(query: string): PaletteItem[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return PALETTE_COMMANDS.map((command) => {
    const haystack = `${command.label} ${command.keywords.join(' ')}`;
    const match = fuzzyMatch(trimmed, haystack);
    return match ? { kind: 'command' as const, command, score: match.score } : null;
  })
    .filter((x): x is { kind: 'command'; command: PaletteCommand; score: number } => x !== null)
    .sort((a, b) => b.score - a.score);
}

/** Browse mode: keep the incoming order (newest first) with a descending synthetic score. */
export function orderEntries(entries: ClipboardEntry[]): PaletteItem[] {
  return entries.map((entry, index) => ({
    kind: 'entry' as const,
    entry,
    score: BROWSE_SCORE_BASE - index,
  }));
}

/**
 * Re-rank entries against a query with the local fuzzy matcher.
 *
 * Used on top of backend full-text results: the FTS index decides *which*
 * entries match across the whole history, and this decides their order.
 * Ties fall back to the incoming order, which preserves recency.
 */
export function rankEntriesByQuery(query: string, entries: ClipboardEntry[]): PaletteItem[] {
  const trimmed = query.trim();
  if (!trimmed) return orderEntries(entries);

  return entries
    .map((entry, index) => {
      const text = `${entry.content ?? ''} ${entry.content_preview ?? ''} ${entry.source_app ?? ''}`;
      const match = fuzzyMatch(trimmed, text);
      return match ? { entry, score: match.score, index } : null;
    })
    .filter((x): x is { entry: ClipboardEntry; score: number; index: number } => x !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ entry, score }) => ({ kind: 'entry' as const, entry, score }));
}

/** Keep only entries of the given type. A null filter is a no-op. */
export function filterByType(
  entries: ClipboardEntry[],
  contentType: ContentType | null,
): ClipboardEntry[] {
  if (!contentType) return entries;
  return entries.filter((e) => e.content_type === contentType);
}

/** Assemble the ordered groups and pick the default AI-command target. */
export function buildPaletteResult(
  commandItems: PaletteItem[],
  entryItems: PaletteItem[],
): PaletteComposeResult {
  const groups: PaletteGroup[] = [];
  if (commandItems.length > 0) {
    groups.push({ kind: 'commands', title: 'AI 命令', items: commandItems });
  }
  if (entryItems.length > 0) {
    groups.push({ kind: 'history', title: '剪贴板历史', items: entryItems });
  }

  const firstItem = entryItems[0];
  const topEntry = firstItem?.kind === 'entry' ? firstItem.entry : null;
  return { groups, topEntry };
}

/**
 * Compose palette results from an in-memory entry list.
 *
 * Pure and synchronous. The UI uses this for browse mode; the search path goes
 * through the backend index instead (see `createRemotePaletteComposer` in the UI
 * package, which reuses the helpers above).
 */
export function composePaletteResults(
  query: string,
  entries: ClipboardEntry[],
): PaletteComposeResult {
  const trimmed = query.trim();
  const entryItems = trimmed
    ? rankEntriesByQuery(trimmed, entries)
    : orderEntries(entries);
  return buildPaletteResult(matchCommands(trimmed), entryItems);
}
