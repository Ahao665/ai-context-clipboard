import { fuzzyMatch } from './fuzzy';
import { PALETTE_COMMANDS } from './commands';
import type {
  ClipboardEntry,
  PaletteCommand,
  PaletteComposeResult,
  PaletteGroup,
  PaletteItem,
} from '@ai-clipboard/types';

export function composePaletteResults(
  query: string,
  entries: ClipboardEntry[],
): PaletteComposeResult {
  const trimmed = query.trim();
  const groups: PaletteGroup[] = [];

  // AI Commands — only when a query exists; fuzzy-matched, best first.
  let commandItems: PaletteItem[] = [];
  if (trimmed) {
    commandItems = PALETTE_COMMANDS
      .map((command) => {
        const haystack = `${command.label} ${command.keywords.join(' ')}`;
        const match = fuzzyMatch(trimmed, haystack);
        return match ? { kind: 'command' as const, command, score: match.score } : null;
      })
      .filter((x): x is { kind: 'command'; command: PaletteCommand; score: number } => x !== null)
      .sort((a, b) => b.score - a.score);
  }
  if (commandItems.length > 0) groups.push({ kind: 'commands', title: 'AI 命令', items: commandItems });

  // Clipboard History — empty query: all entries in input order (recent first).
  // Non-empty: fuzzy-match against full content + preview + source_app, best first, recency tiebreak.
  let entryItems: PaletteItem[];
  if (!trimmed) {
    entryItems = entries.map((entry, index) => ({ kind: 'entry' as const, entry, score: 1_000_000 - index }));
  } else {
    const scored = entries
      .map((entry, index) => {
        const text = `${entry.content ?? ''} ${entry.content_preview ?? ''} ${entry.source_app ?? ''}`;
        const match = fuzzyMatch(trimmed, text);
        return match ? { entry, score: match.score, index } : null;
      })
      .filter((x): x is { entry: ClipboardEntry; score: number; index: number } => x !== null)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    entryItems = scored.map(({ entry, score }) => ({ kind: 'entry' as const, entry, score }));
  }
  if (entryItems.length > 0) groups.push({ kind: 'history', title: '剪贴板历史', items: entryItems });

  const firstItem = entryItems[0];
  const topEntry: ClipboardEntry | null = firstItem?.kind === 'entry' ? firstItem.entry : null;
  return { groups, topEntry };
}
