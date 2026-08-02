import type { ActionId } from './actions';
import type { ClipboardEntry } from './clipboard';

/** An AI action exposed as a launchable palette command. */
export interface PaletteCommand {
  id: string;
  actionId: ActionId;
  label: string;
  description: string;
  keywords: string[];
  category: string;
}

/** A single palette result row: either an AI command or a clipboard history entry. */
export type PaletteItem =
  | { kind: 'command'; command: PaletteCommand; score: number }
  | { kind: 'entry'; entry: ClipboardEntry; score: number };

/** A titled group of palette results. */
export interface PaletteGroup {
  kind: 'commands' | 'history';
  title: string;
  items: PaletteItem[];
}

/** Output of composePaletteResults: ordered groups + the top history match (AI command target). */
export interface PaletteComposeResult {
  groups: PaletteGroup[];
  topEntry: ClipboardEntry | null;
}
