import type { ClipboardEntry, ContentType } from './clipboard';

export interface ClipboardChangedPayload {
  id: string;
  content: string;
  content_type: ContentType;
  timestamp: number;
}

export interface ShortcutTriggeredPayload {
  name: string;
}

export interface ActionResultPayload {
  actionId: string;
  chunk?: string;
  done: boolean;
  result?: string;
  error?: string;
}

export type EventPayload =
  | { event: 'clipboard:changed'; data: ClipboardChangedPayload }
  | { event: 'shortcut:triggered'; data: ShortcutTriggeredPayload }
  | { event: 'action:result'; data: ActionResultPayload };
