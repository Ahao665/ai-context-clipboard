export type ContentType = 'text' | 'code' | 'url' | 'json' | 'email' | 'unknown';
export type ContentStorage = 'inline' | 'file' | 'compressed';

export interface ClipboardEntry {
  id: string;
  content_hash: string;
  content_type: ContentType;
  subtype?: string;
  content: string;
  content_preview: string;
  content_storage: ContentStorage;
  content_ref?: string;
  content_size: number;
  source_app?: string;
  source_window?: string;
  is_deleted?: boolean;
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
