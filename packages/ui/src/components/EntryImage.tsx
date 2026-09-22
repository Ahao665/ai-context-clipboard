import { useEffect, useRef, useState } from 'react';
import type { ClipboardEntry } from '@ai-clipboard/types';
import { getEntryImage } from '../lib/tauri-api';
import { formatBytes } from '../lib/entry-preview';

/**
 * Loaded thumbnails, keyed by entry id.
 *
 * A 320px bitmap is a few hundred KB once base64-encoded, and the browse window
 * holds up to 200 rows, so this cache is bounded and evicts oldest-first — a
 * `Map` iterates in insertion order, which makes it its own LRU queue. Anything
 * evicted is simply re-fetched if it scrolls back into view.
 */
const thumbnails = new Map<string, string>();
const MAX_CACHED_THUMBNAILS = 40;

function rememberThumbnail(id: string, data: string): void {
  thumbnails.set(id, data);
  while (thumbnails.size > MAX_CACHED_THUMBNAILS) {
    const oldest = thumbnails.keys().next().value;
    if (oldest === undefined) break;
    thumbnails.delete(oldest);
  }
}

/**
 * The small preview shown in a list row.
 *
 * The fetch is deferred until the row is actually on screen: a thumbnail is
 * cheap on its own, but 200 of them requested at mount is not. Rows that never
 * scroll into view never cost anything.
 */
export function EntryThumbnail({ entryId }: { entryId: string }) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [src, setSrc] = useState<string | null>(() => thumbnails.get(entryId) ?? null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const cached = thumbnails.get(entryId);
    if (cached) {
      setSrc(cached);
      return;
    }
    setSrc(null);
    setMissing(false);

    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    // The placeholder is given a fixed size in CSS precisely so this observer
    // has a non-zero-area target to work with.
    const observer = new IntersectionObserver((observed) => {
      if (!observed.some((o) => o.isIntersecting)) return;
      observer.disconnect();

      getEntryImage(entryId, true)
        .then((data) => {
          if (cancelled) return;
          if (data) {
            rememberThumbnail(entryId, data);
            setSrc(data);
          } else {
            // The entry predates image support, or the file was cleaned up.
            setMissing(true);
          }
        })
        .catch(() => {
          if (!cancelled) setMissing(true);
        });
    });
    observer.observe(host);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [entryId]);

  return (
    <span className="history-thumb" ref={hostRef} aria-hidden="true">
      {missing ? <span className="history-thumb-fallback">🖼️</span> : null}
      {src ? <img src={src} alt="" /> : null}
    </span>
  );
}

/**
 * The full-size bitmap shown in the detail view.
 *
 * Deliberately uncached: a 1920×1080 capture is several megabytes of base64 and
 * only one of these is ever on screen at a time, so holding on to it after the
 * user navigates away would be pure waste.
 */
export function EntryImage({ entry }: { entry: ClipboardEntry }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);

    getEntryImage(entry.id, false)
      .then((data) => {
        if (cancelled) return;
        if (data) setSrc(data);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  return (
    <div className="detail-image">
      <div className="detail-image-frame">
        {failed ? (
          <div className="detail-image-missing">图片文件已不存在</div>
        ) : src ? (
          <img src={src} alt={entry.content_preview ?? '剪贴板图片'} />
        ) : (
          <div className="detail-image-missing">加载中...</div>
        )}
      </div>
      <div className="detail-image-meta">
        {entry.content_preview ?? '剪贴板图片'}
        <span className="detail-image-sep">·</span>
        {formatBytes(entry.content_size)}
      </div>
    </div>
  );
}
