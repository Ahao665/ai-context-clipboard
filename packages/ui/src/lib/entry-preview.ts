import type { ClipboardEntry } from '@ai-clipboard/types';

/** Placeholder shown when an entry has neither content nor a preview. */
export const EMPTY_PREVIEW = '(空)';

/** Default number of characters stored as an entry's preview. */
export const PREVIEW_LENGTH = 200;

/**
 * Build the preview stored alongside a captured entry.
 *
 * Newlines and runs of whitespace are collapsed so list rows stay single-line,
 * and truncation happens on the flattened text — a raw `slice` could otherwise
 * cut mid-newline and waste the preview budget on blank lines.
 */
export function buildPreview(text: string, max = PREVIEW_LENGTH): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) : flat;
}

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

/**
 * One-line description of a captured bitmap, e.g. `图片 1920×1080`.
 *
 * Image entries have no text, so this stands in for the preview in list rows,
 * search results and the command palette.
 */
export function imagePreview(width: number, height: number): string {
  return `图片 ${width}×${height}`;
}

/**
 * A human-readable byte size, e.g. `1.4 MB`.
 *
 * Used for the image detail view, where "how big is this" is the only thing the
 * user can judge before deciding to keep or delete the capture.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal below 10 keeps `1.4 MB` informative without `1.437 MB` noise.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** True when the entry has text we can actually send to the AI. */
export function entryHasContent(entry: Pick<ClipboardEntry, 'content'>): boolean {
  return typeof entry.content === 'string' && entry.content.trim().length > 0;
}
