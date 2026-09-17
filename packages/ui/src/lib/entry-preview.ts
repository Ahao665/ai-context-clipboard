import type { ClipboardEntry } from '@ai-clipboard/types';

/** Placeholder shown when an entry has neither content nor a preview. */
export const EMPTY_PREVIEW = '(空)';

/**
 * A display-safe single-line preview for an entry.
 *
 * `content_preview` is nullable (see `ClipboardEntry`), and older rows may lack
 * one, so every render path must go through here instead of slicing the field
 * directly — slicing a null would throw.
 */
export function entryPreview(entry: Pick<ClipboardEntry, 'content' | 'content_preview'>): string {
  const raw = entry.content_preview ?? entry.content ?? '';
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > 0 ? flat : EMPTY_PREVIEW;
}

/** Preview truncated for inline hints, e.g. 对「…」执行. */
export function entryPreviewShort(
  entry: Pick<ClipboardEntry, 'content' | 'content_preview'>,
  max = 20,
): string {
  const preview = entryPreview(entry);
  return preview.length > max ? `${preview.slice(0, max)}…` : preview;
}

/** True when the entry has text we can actually send to the AI. */
export function entryHasContent(entry: Pick<ClipboardEntry, 'content'>): boolean {
  return typeof entry.content === 'string' && entry.content.trim().length > 0;
}
