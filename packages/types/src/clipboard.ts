export type ContentType =
  | 'text'
  | 'code'
  | 'url'
  | 'json'
  | 'email'
  /** A captured bitmap. Its bytes live on disk; `content_ref` names the file. */
  | 'image'
  | 'unknown';
export type ContentStorage = 'inline' | 'file' | 'compressed';

export interface ClipboardEntry {
  id: string;
  content_hash: string;
  content_type: ContentType;
  subtype?: string;
  /**
   * Full clipboard text. Nullable because the Rust layer stores it as
   * `Option<String>` — an entry can carry only a preview (e.g. very large
   * payloads stored out-of-line via `content_storage: 'file'`).
   */
  content: string | null;
  /**
   * Short preview used by list rows. Nullable for the same reason as `content`;
   * always render through a fallback rather than assuming a string.
   */
  content_preview: string | null;
  content_storage: ContentStorage;
  content_ref?: string;
  content_size: number;
  source_app?: string;
  source_window?: string;
  is_deleted?: boolean;
  /** Pinned entries sort above everything else in list and search results. */
  is_pinned?: boolean;
  created_at: number;
  updated_at: number;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  query?: string;
  contentType?: ContentType;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
