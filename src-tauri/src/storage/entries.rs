use crate::storage::db::Database;
use rusqlite::params;
use serde::{Deserialize, Serialize};

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
            .query_map(params![limit, offset], |row| {
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
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(entries)
    }

    pub fn find_by_hash(&self, hash: &str) -> rusqlite::Result<Option<ClipboardEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM clipboard_entries WHERE content_hash = ?1 AND is_deleted = 0 LIMIT 1",
        )?;
        let mut rows = stmt.query_map(params![hash], |row| {
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
        })?;
        match rows.next() {
            Some(Ok(entry)) => Ok(Some(entry)),
            _ => Ok(None),
        }
    }

    pub fn search_entries(
        &self,
        query: &str,
        limit: i64,
    ) -> rusqlite::Result<Vec<ClipboardEntry>> {
        let conn = self.conn.lock().unwrap();
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT * FROM clipboard_entries
             WHERE is_deleted = 0 AND (content LIKE ?1 OR content_preview LIKE ?1)
             ORDER BY created_at DESC
             LIMIT ?2",
        )?;
        let entries = stmt
            .query_map(params![pattern, limit], |row| {
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
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(entries)
    }

    pub fn delete_entry(&self, id: &str) -> rusqlite::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE clipboard_entries SET is_deleted = 1, updated_at = ?1 WHERE id = ?2",
            params![chrono::Utc::now().timestamp_millis(), id],
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
        let results = db.search_entries("rust", 10).unwrap();
        assert_eq!(results.len(), 1);
        let results2 = db.search_entries("python", 10).unwrap();
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
}
