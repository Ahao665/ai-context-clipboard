use crate::storage::db::Database;
use crate::storage::entries::ClipboardEntry;
use rusqlite::params;

impl Database {
    /// Number of live (non-deleted) entries.
    pub fn count_entries(&self) -> rusqlite::Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT COUNT(*) FROM clipboard_entries WHERE is_deleted = 0",
            [],
            |row| row.get(0),
        )
    }

    /// Soft-delete every live entry and drop the FTS index in one transaction.
    /// Returns the number of rows affected.
    pub fn clear_history(&self) -> rusqlite::Result<usize> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let now = chrono::Utc::now().timestamp_millis();

        let affected = tx.execute(
            "UPDATE clipboard_entries SET is_deleted = 1, updated_at = ?1 WHERE is_deleted = 0",
            params![now],
        )?;
        tx.execute("DELETE FROM clipboard_entries_fts", [])?;
        tx.commit()?;
        Ok(affected)
    }

    /// Hard-delete soft-deleted rows plus any orphaned FTS rows.
    ///
    /// Returns the number of entry rows purged. Note this does NOT VACUUM —
    /// reclaiming file space requires exclusive access and can block for a long
    /// time, so it is exposed separately via [`Database::vacuum`].
    pub fn purge_deleted(&self) -> rusqlite::Result<usize> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        // Drop FTS rows whose entry is gone or soft-deleted.
        tx.execute(
            "DELETE FROM clipboard_entries_fts
             WHERE content_hash NOT IN (
                 SELECT content_hash FROM clipboard_entries WHERE is_deleted = 0
             )",
            [],
        )?;
        let purged = tx.execute("DELETE FROM clipboard_entries WHERE is_deleted = 1", [])?;
        tx.commit()?;
        Ok(purged)
    }

    /// Reclaim unused file space. Must not run inside a transaction, and needs
    /// exclusive access to the database, so it is kept out of the purge path.
    pub fn vacuum(&self) -> rusqlite::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch("VACUUM;")
    }

    /// Enforce the `ui.max_history` cap: soft-delete the oldest entries beyond `max`
    /// and drop their FTS rows. Returns the number trimmed.
    pub fn enforce_history_cap(&self, max: i64) -> rusqlite::Result<usize> {
        if max <= 0 {
            return Ok(0);
        }
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let now = chrono::Utc::now().timestamp_millis();

        let trimmed = tx.execute(
            "UPDATE clipboard_entries SET is_deleted = 1, updated_at = ?1
             WHERE is_deleted = 0
               AND id NOT IN (
                   SELECT id FROM clipboard_entries
                   WHERE is_deleted = 0
                   ORDER BY created_at DESC
                   LIMIT ?2
               )",
            params![now, max],
        )?;
        tx.execute(
            "DELETE FROM clipboard_entries_fts
             WHERE content_hash NOT IN (
                 SELECT content_hash FROM clipboard_entries WHERE is_deleted = 0
             )",
            [],
        )?;
        tx.commit()?;
        Ok(trimmed)
    }

    /// Most recent entry regardless of type — used by the palette's default target.
    pub fn latest_entry(&self) -> rusqlite::Result<Option<ClipboardEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM clipboard_entries
             WHERE is_deleted = 0
             ORDER BY created_at DESC
             LIMIT 1",
        )?;
        let mut rows = stmt.query_map([], super::entries::row_to_entry)?;
        match rows.next() {
            Some(Ok(entry)) => Ok(Some(entry)),
            _ => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::entries::ClipboardEntry;
    use std::sync::atomic::{AtomicU32, Ordering};

    static TEST_COUNTER: AtomicU32 = AtomicU32::new(0);

    fn test_db() -> Database {
        let id = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("aicc_maint_{}", id));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Database::new(dir).unwrap()
    }

    fn sample(id: &str, content: &str, created_at: i64) -> ClipboardEntry {
        ClipboardEntry {
            id: id.into(),
            content_hash: format!("hash-{}", id),
            content_type: "text".into(),
            subtype: None,
            content: Some(content.into()),
            content_preview: Some(content.into()),
            content_storage: "inline".into(),
            content_ref: None,
            content_size: content.len() as i64,
            source_app: Some("test".into()),
            source_window: None,
            is_deleted: false,
            created_at,
            updated_at: created_at,
        }
    }

    #[test]
    fn test_count_entries_excludes_deleted() {
        let db = test_db();
        db.save_entry(&sample("c1", "one", 1000)).unwrap();
        db.save_entry(&sample("c2", "two", 2000)).unwrap();
        assert_eq!(db.count_entries().unwrap(), 2);

        db.delete_entry("c1").unwrap();
        assert_eq!(db.count_entries().unwrap(), 1, "soft-deleted row must not count");
    }

    #[test]
    fn test_clear_history_empties_list_and_index() {
        let db = test_db();
        for i in 0..5 {
            db.save_entry(&sample(&format!("h{}", i), &format!("item {}", i), 1000 + i))
                .unwrap();
        }
        let cleared = db.clear_history().unwrap();
        assert_eq!(cleared, 5);
        assert_eq!(db.list_entries(50, 0).unwrap().len(), 0);
        assert_eq!(db.count_entries().unwrap(), 0);

        // FTS must be empty too, so nothing comes back from search.
        let conn = db.conn.lock().unwrap();
        let indexed: i64 = conn
            .query_row("SELECT COUNT(*) FROM clipboard_entries_fts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(indexed, 0, "clear_history must purge the FTS index");
    }

    #[test]
    fn test_clear_history_is_idempotent() {
        let db = test_db();
        db.save_entry(&sample("i1", "only", 1000)).unwrap();
        assert_eq!(db.clear_history().unwrap(), 1);
        assert_eq!(db.clear_history().unwrap(), 0, "second clear affects nothing");
    }

    #[test]
    fn test_purge_deleted_removes_rows_physically() {
        let db = test_db();
        db.save_entry(&sample("p1", "keep me", 1000)).unwrap();
        db.save_entry(&sample("p2", "drop me", 2000)).unwrap();
        db.delete_entry("p2").unwrap();

        let purged = db.purge_deleted().unwrap();
        assert!(purged >= 1, "purge should report at least the soft-deleted row");
        assert_eq!(db.count_entries().unwrap(), 1, "only the live entry remains");

        // Scoped so the connection guard is released before calling back into `db`
        // (the connection Mutex is not reentrant — holding it would deadlock).
        {
            let conn = db.conn.lock().unwrap();
            let total: i64 = conn
                .query_row("SELECT COUNT(*) FROM clipboard_entries", [], |r| r.get(0))
                .unwrap();
            let soft: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM clipboard_entries WHERE is_deleted = 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(
                soft, 0,
                "purge must physically delete soft-deleted rows (found {} still flagged)",
                soft
            );
            assert_eq!(total, 1, "exactly one physical row should remain");
        }

        assert!(
            db.find_by_hash("hash-p2").unwrap().is_none(),
            "purged row must be gone"
        );
    }

    #[test]
    fn test_purge_deleted_keeps_live_rows_searchable() {
        let db = test_db();
        db.save_entry(&sample("q1", "searchable survivor", 1000)).unwrap();
        db.save_entry(&sample("q2", "doomed", 2000)).unwrap();
        db.delete_entry("q2").unwrap();
        db.purge_deleted().unwrap();

        let results = db.search_entries("survivor", 50, 0, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "q1");
    }

    #[test]
    fn test_enforce_history_cap_keeps_newest() {
        let db = test_db();
        for i in 0..10 {
            db.save_entry(&sample(&format!("cap{}", i), &format!("entry {}", i), 1000 + i))
                .unwrap();
        }
        let trimmed = db.enforce_history_cap(4).unwrap();
        assert_eq!(trimmed, 6, "10 entries capped at 4 → 6 trimmed");

        let remaining = db.list_entries(50, 0).unwrap();
        assert_eq!(remaining.len(), 4);
        // list_entries is newest-first, so cap9..cap6 survive.
        assert_eq!(remaining[0].id, "cap9");
        assert_eq!(remaining[3].id, "cap6");
    }

    #[test]
    fn test_enforce_history_cap_noop_when_under_limit() {
        let db = test_db();
        db.save_entry(&sample("u1", "a", 1000)).unwrap();
        db.save_entry(&sample("u2", "b", 2000)).unwrap();
        assert_eq!(db.enforce_history_cap(10).unwrap(), 0);
        assert_eq!(db.count_entries().unwrap(), 2);
    }

    #[test]
    fn test_enforce_history_cap_purges_fts_for_trimmed() {
        let db = test_db();
        for i in 0..6 {
            db.save_entry(&sample(
                &format!("ft{}", i),
                if i == 0 { "ancient unique phrase" } else { "common text" },
                1000 + i,
            ))
            .unwrap();
        }
        db.enforce_history_cap(3).unwrap();
        // The oldest entry was trimmed, so its content must leave the index too.
        assert_eq!(db.search_entries("ancient", 50, 0, None).unwrap().len(), 0);
        assert!(db.search_entries("common", 50, 0, None).unwrap().len() >= 1);
    }

    #[test]
    fn test_latest_entry_returns_newest_live() {
        let db = test_db();
        assert!(db.latest_entry().unwrap().is_none(), "empty db → None");

        db.save_entry(&sample("l1", "older", 1000)).unwrap();
        db.save_entry(&sample("l2", "newer", 2000)).unwrap();
        assert_eq!(db.latest_entry().unwrap().unwrap().id, "l2");

        db.delete_entry("l2").unwrap();
        assert_eq!(db.latest_entry().unwrap().unwrap().id, "l1");
    }
}
