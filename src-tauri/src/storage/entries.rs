use crate::storage::db::Database;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

/// Shared row mapper — maps a `SELECT *` / explicit-column row of `clipboard_entries`
/// into a `ClipboardEntry`. Keeps the (previously duplicated) mappers in one place.
pub(crate) fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClipboardEntry> {
    Ok(ClipboardEntry {
        id: row.get(0)?,
        content_hash: row.get(1)?,
        content_type: row.get(2)?,
        subtype: row.get(3)?,
        content: row.get(4)?,
        content_preview: row.get(5)?,
        content_storage: row.get(6)?,
        content_ref: row.get(7)?,
        content_size: row.get(8)?,
        source_app: row.get(9)?,
        source_window: row.get(10)?,
        is_deleted: row.get::<_, i32>(11)? != 0,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClipboardEntry {
    pub id: String,
    pub content_hash: String,
    pub content_type: String,
    pub subtype: Option<String>,
    pub content: Option<String>,
    pub content_preview: Option<String>,
    pub content_storage: String,
    pub content_ref: Option<String>,
    pub content_size: i64,
    pub source_app: Option<String>,
    pub source_window: Option<String>,
    pub is_deleted: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Database {
    pub fn save_entry(&self, entry: &ClipboardEntry) -> rusqlite::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO clipboard_entries
             (id, content_hash, content_type, subtype, content, content_preview,
              content_storage, content_ref, content_size, source_app, source_window,
              is_deleted, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                entry.id,
                entry.content_hash,
                entry.content_type,
                entry.subtype,
                entry.content,
                entry.content_preview,
                entry.content_storage,
                entry.content_ref,
                entry.content_size,
                entry.source_app,
                entry.source_window,
                entry.is_deleted,
                entry.created_at,
                entry.updated_at,
            ],
        )?;

        // Keep FTS index in sync (delete-then-insert avoids FTS5 REPLACE rowid orphans).
        conn.execute(
            "DELETE FROM clipboard_entries_fts WHERE content_hash = ?1",
            params![entry.content_hash],
        )?;
        conn.execute(
            "INSERT INTO clipboard_entries_fts (content, content_preview, content_hash)
             VALUES (?1, ?2, ?3)",
            params![entry.content, entry.content_preview, entry.content_hash],
        )?;
        Ok(())
    }

    pub fn list_entries(&self, limit: i64, offset: i64) -> rusqlite::Result<Vec<ClipboardEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM clipboard_entries
             WHERE is_deleted = 0
             ORDER BY created_at DESC
             LIMIT ?1 OFFSET ?2",
        )?;
        let entries = stmt
            .query_map(params![limit, offset], row_to_entry)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(entries)
    }

    pub fn find_by_hash(&self, hash: &str) -> rusqlite::Result<Option<ClipboardEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM clipboard_entries WHERE content_hash = ?1 AND is_deleted = 0 LIMIT 1",
        )?;
        let mut rows = stmt.query_map(params![hash], row_to_entry)?;
        match rows.next() {
            Some(Ok(entry)) => Ok(Some(entry)),
            _ => Ok(None),
        }
    }

    pub fn search_entries(
        &self,
        query: &str,
        limit: i64,
        offset: i64,
        content_type: Option<&str>,
    ) -> rusqlite::Result<Vec<ClipboardEntry>> {
        let conn = self.conn.lock().unwrap();
        let trimmed = query.trim();

        // Empty query → plain recent list (optionally type-filtered).
        if trimmed.is_empty() {
            let mut stmt = conn.prepare(
                "SELECT * FROM clipboard_entries
                 WHERE is_deleted = 0
                   AND (?1 IS NULL OR content_type = ?1)
                 ORDER BY created_at DESC
                 LIMIT ?2 OFFSET ?3",
            )?;
            let rows = stmt.query_map(params![content_type, limit, offset], row_to_entry)?;
            return rows.collect();
        }

        // Queries shorter than 3 characters can't build trigrams → LIKE fallback.
        // (Measured in characters, not bytes: the trigram tokenizer needs 3 UTF-8
        // codepoints, so a 2-char CJK query like "查询" must fall back to LIKE too.)
        if trimmed.chars().count() < 3 {
            return Self::search_like(&conn, trimmed, limit, offset, content_type);
        }

        // FTS5 trigram path. MVP: match + recency sort (no bm25 / no behavior learning).
        let escaped = trimmed.replace('"', "\"\"");
        let match_query = format!("\"{}\"", escaped);
        let result = (|| -> rusqlite::Result<Vec<ClipboardEntry>> {
            let mut stmt = conn.prepare(
                "SELECT e.id, e.content_hash, e.content_type, e.subtype, e.content,
                        e.content_preview, e.content_storage, e.content_ref, e.content_size,
                        e.source_app, e.source_window, e.is_deleted, e.created_at, e.updated_at
                 FROM clipboard_entries_fts f
                 JOIN clipboard_entries e ON e.content_hash = f.content_hash
                 WHERE clipboard_entries_fts MATCH ?1
                   AND e.is_deleted = 0
                   AND (?2 IS NULL OR e.content_type = ?2)
                 ORDER BY e.created_at DESC
                 LIMIT ?3 OFFSET ?4",
            )?;
            let rows = stmt.query_map(params![match_query, content_type, limit, offset], row_to_entry)?;
            rows.collect()
        })();

        // Any MATCH parsing error (odd user input) degrades to LIKE — never panic.
        match result {
            Ok(entries) => Ok(entries),
            Err(_) => Self::search_like(&conn, trimmed, limit, offset, content_type),
        }
    }

    fn search_like(
        conn: &Connection,
        query: &str,
        limit: i64,
        offset: i64,
        content_type: Option<&str>,
    ) -> rusqlite::Result<Vec<ClipboardEntry>> {
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT * FROM clipboard_entries
             WHERE is_deleted = 0
               AND (content LIKE ?1 OR content_preview LIKE ?1 OR source_app LIKE ?1)
               AND (?2 IS NULL OR content_type = ?2)
             ORDER BY created_at DESC
             LIMIT ?3 OFFSET ?4",
        )?;
        let rows = stmt
            .query_map(params![pattern, content_type, limit, offset], row_to_entry)?;
        rows.collect()
    }

    pub fn delete_entry(&self, id: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE clipboard_entries SET is_deleted = 1, updated_at = ?1 WHERE id = ?2",
            params![chrono::Utc::now().timestamp_millis(), id],
        )?;
        conn.execute(
            "DELETE FROM clipboard_entries_fts
             WHERE content_hash IN (SELECT content_hash FROM clipboard_entries WHERE id = ?1)",
            params![id],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> rusqlite::Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
        let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
        match rows.next() {
            Some(Ok(val)) => Ok(Some(val)),
            _ => Ok(None),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
            params![key, value, chrono::Utc::now().timestamp_millis()],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Database;

    use std::sync::atomic::{AtomicU32, Ordering};
    static TEST_COUNTER: AtomicU32 = AtomicU32::new(0);

    fn test_db() -> Database {
        let id = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("aicc_test_{}", id));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Database::new(dir).unwrap()
    }

    #[test]
    fn test_save_and_list_entries() {
        let db = test_db();
        let entry = ClipboardEntry {
            id: "test-1".into(),
            content_hash: "abc123".into(),
            content_type: "text".into(),
            subtype: None,
            content: Some("hello world".into()),
            content_preview: Some("hello world".into()),
            content_storage: "inline".into(),
            content_ref: None,
            content_size: 11,
            source_app: Some("test".into()),
            source_window: None,
            is_deleted: false,
            created_at: 1000,
            updated_at: 1000,
        };
        db.save_entry(&entry).unwrap();
        let entries = db.list_entries(10, 0).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content_hash, "abc123");
    }

    #[test]
    fn test_find_by_hash() {
        let db = test_db();
        let entry = ClipboardEntry {
            id: "test-2".into(),
            content_hash: "def456".into(),
            content_type: "code".into(),
            subtype: Some("javascript".into()),
            content: Some("console.log('hi')".into()),
            content_preview: Some("console.log('hi')".into()),
            content_storage: "inline".into(),
            content_ref: None,
            content_size: 18,
            source_app: None,
            source_window: None,
            is_deleted: false,
            created_at: 2000,
            updated_at: 2000,
        };
        db.save_entry(&entry).unwrap();
        let found = db.find_by_hash("def456").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, "test-2");

        let not_found = db.find_by_hash("nonexistent").unwrap();
        assert!(not_found.is_none());
    }

    #[test]
    fn test_settings() {
        let db = test_db();
        db.set_setting("test_key", "test_value").unwrap();
        let val = db.get_setting("test_key").unwrap();
        assert_eq!(val, Some("test_value".into()));
    }

    #[test]
    fn test_search_entries() {
        let db = test_db();
        let entry = ClipboardEntry {
            id: "test-3".into(),
            content_hash: "ghi789".into(),
            content_type: "text".into(),
            subtype: None,
            content: Some("rust is a systems programming language".into()),
            content_preview: Some("rust is a systems...".into()),
            content_storage: "inline".into(),
            content_ref: None,
            content_size: 38,
            source_app: None,
            source_window: None,
            is_deleted: false,
            created_at: 3000,
            updated_at: 3000,
        };
        db.save_entry(&entry).unwrap();
        let results = db.search_entries("rust", 10, 0, None).unwrap();
        assert_eq!(results.len(), 1);
        let results2 = db.search_entries("python", 10, 0, None).unwrap();
        assert_eq!(results2.len(), 0);
    }

    #[test]
    fn test_soft_delete() {
        let db = test_db();
        let entry = ClipboardEntry {
            id: "test-4".into(),
            content_hash: "jkl012".into(),
            content_type: "text".into(),
            subtype: None,
            content: Some("to be deleted".into()),
            content_preview: Some("to be deleted".into()),
            content_storage: "inline".into(),
            content_ref: None,
            content_size: 13,
            source_app: None,
            source_window: None,
            is_deleted: false,
            created_at: 4000,
            updated_at: 4000,
        };
        db.save_entry(&entry).unwrap();
        assert_eq!(db.list_entries(10, 0).unwrap().len(), 1);
        db.delete_entry("test-4").unwrap();
        assert_eq!(db.list_entries(10, 0).unwrap().len(), 0);
    }

    fn sample_entry(id: &str, content: &str) -> ClipboardEntry {
        ClipboardEntry {
            id: id.into(),
            content_hash: format!("hash-{}", id),
            content_type: "text".into(),
            subtype: None,
            content: Some(content.into()),
            content_preview: Some(content.chars().take(80).collect()),
            content_storage: "inline".into(),
            content_ref: None,
            content_size: content.len() as i64,
            source_app: Some("test".into()),
            source_window: None,
            is_deleted: false,
            created_at: 1000,
            updated_at: 1000,
        }
    }

    #[test]
    fn test_fts_trigram_available() {
        // Probe: the bundled SQLite must expose FTS5 + the trigram tokenizer.
        let db = test_db();
        let conn = db.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS _probe USING fts5(a, tokenize='trigram', detail='none');",
        )
        .expect("bundled SQLite must provide FTS5 trigram tokenizer");
    }

    #[test]
    fn test_search_chinese_substring() {
        let db = test_db();
        db.save_entry(&sample_entry("c1", "数据库查询优化实战")).unwrap();
        db.save_entry(&sample_entry("c2", "关于编译器的读书笔记")).unwrap();
        let results = db.search_entries("查询", 50, 0, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "c1");
    }

    #[test]
    fn test_search_english_substring() {
        let db = test_db();
        db.save_entry(&sample_entry("en1", "The quick brown fox jumps over the lazy dog")).unwrap();
        db.save_entry(&sample_entry("en2", "nothing to see here")).unwrap();
        let results = db.search_entries("brown", 50, 0, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "en1");
    }

    #[test]
    fn test_search_short_ascii_fallback() {
        let db = test_db();
        db.save_entry(&sample_entry("a1", "hello world")).unwrap();
        // 2 bytes < 3 → LIKE fallback path, must still match substring.
        let results = db.search_entries("he", 50, 0, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "a1");
    }

    #[test]
    fn test_search_orders_by_recency() {
        let db = test_db();
        let mut old = sample_entry("r1", "apple banana");
        old.created_at = 1000;
        let mut new = sample_entry("r2", "apple pie");
        new.created_at = 2000;
        db.save_entry(&old).unwrap();
        db.save_entry(&new).unwrap();
        let results = db.search_entries("apple", 50, 0, None).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].id, "r2", "newest match must sort first (recency)");
    }

    #[test]
    fn test_search_empty_query_returns_recent() {
        let db = test_db();
        db.save_entry(&sample_entry("e1", "first")).unwrap();
        db.save_entry(&sample_entry("e2", "second")).unwrap();
        let results = db.search_entries("", 50, 0, None).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_search_deleted_excluded() {
        let db = test_db();
        db.save_entry(&sample_entry("d1", "secret plan")).unwrap();
        db.delete_entry("d1").unwrap();
        assert_eq!(db.search_entries("secret", 50, 0, None).unwrap().len(), 0);
    }

    #[test]
    fn test_search_content_type_filter() {
        let db = test_db();
        let mut code = sample_entry("t1", "fn main() { println!(\"hi\"); }");
        code.content_type = "code".into();
        db.save_entry(&code).unwrap();
        db.save_entry(&sample_entry("t2", "just a plain sentence")).unwrap();
        let results = db.search_entries("hi", 50, 0, Some("code")).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "t1");
    }

    #[test]
    fn test_save_and_delete_sync_fts() {
        let db = test_db();
        db.save_entry(&sample_entry("s1", "sync me")).unwrap();
        assert_eq!(db.search_entries("sync", 50, 0, None).unwrap().len(), 1);
        db.delete_entry("s1").unwrap();
        assert_eq!(db.search_entries("sync", 50, 0, None).unwrap().len(), 0);
    }

    #[test]
    fn test_backfill_idempotent_across_reopen() {
        // Simulates an existing user DB (v0.1.0 data) being reopened after upgrade.
        let id = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("aicc_backfill_{}", id));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        {
            let db = Database::new(dir.clone()).unwrap();
            db.save_entry(&sample_entry("b1", "persisted entry")).unwrap();
        } // drop → close db

        {
            let db = Database::new(dir.clone()).unwrap(); // migrate() re-runs on reopen
            let results = db.search_entries("persisted", 50, 0, None).unwrap();
            assert_eq!(results.len(), 1, "backfill must not duplicate rows after reopen");
            assert_eq!(results[0].id, "b1");
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_lifecycle_save_search_delete_search_empty() {
        let db = test_db();
        db.save_entry(&sample_entry("lc1", "lifecycle marker text")).unwrap();
        assert_eq!(db.search_entries("lifecycle", 50, 0, None).unwrap().len(), 1);
        db.delete_entry("lc1").unwrap();
        assert_eq!(db.search_entries("lifecycle", 50, 0, None).unwrap().len(), 0);
    }

    #[test]
    fn test_fts_entries_consistency() {
        let db = test_db();
        db.save_entry(&sample_entry("cx1", "consistent alpha")).unwrap();
        db.save_entry(&sample_entry("cx2", "consistent beta")).unwrap();
        db.delete_entry("cx1").unwrap();

        let conn = db.conn.lock().unwrap();
        let live: i64 = conn
            .query_row("SELECT COUNT(*) FROM clipboard_entries WHERE is_deleted = 0", [], |r| r.get(0))
            .unwrap();
        let indexed: i64 = conn
            .query_row("SELECT COUNT(*) FROM clipboard_entries_fts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(live, indexed, "FTS index must mirror live (non-deleted) entries");
    }

    #[test]
    fn test_search_respects_limit() {
        let db = test_db();
        for i in 0..5 {
            let mut e = sample_entry(&format!("lim{}", i), "limited target word");
            e.created_at = 1000 + i;
            db.save_entry(&e).unwrap();
        }
        let results = db.search_entries("limited", 3, 0, None).unwrap();
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn test_search_chinese_fts_multi_token() {
        let db = test_db();
        db.save_entry(&sample_entry("z1", "数据库查询优化实战")).unwrap();
        db.save_entry(&sample_entry("z2", "编译器优化技巧")).unwrap();
        // 4 chars = multi-trigram phrase → must route through the FTS path and match consecutively.
        let results = db.search_entries("查询优化", 50, 0, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "z1");
    }
}
