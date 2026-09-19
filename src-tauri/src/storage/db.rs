use rusqlite::{Connection, OptionalExtension, Result};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&app_dir).ok();
        let db_path = app_dir.join("clipboard.db");
        let conn = Connection::open(db_path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS clipboard_entries (
                id              TEXT PRIMARY KEY,
                content_hash    TEXT NOT NULL,
                content_type    TEXT NOT NULL DEFAULT 'text',
                subtype         TEXT,
                content         TEXT,
                content_preview TEXT,
                content_storage TEXT DEFAULT 'inline',
                content_ref     TEXT,
                content_size    INTEGER DEFAULT 0,
                source_app      TEXT,
                source_window   TEXT,
                is_deleted      INTEGER DEFAULT 0,
                is_pinned       INTEGER DEFAULT 0,
                created_at      INTEGER NOT NULL,
                updated_at      INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_entries_created_at
                ON clipboard_entries(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_entries_content_hash
                ON clipboard_entries(content_hash);

            CREATE TABLE IF NOT EXISTS action_logs (
                id             TEXT PRIMARY KEY,
                entry_id       TEXT NOT NULL REFERENCES clipboard_entries(id) ON DELETE CASCADE,
                action_id      TEXT NOT NULL,
                action_version TEXT DEFAULT '1.0',
                provider_id    TEXT,
                model          TEXT,
                status         TEXT NOT NULL DEFAULT 'pending',
                input_snippet  TEXT,
                output         TEXT,
                tokens_in      INTEGER,
                tokens_out     INTEGER,
                duration_ms    INTEGER,
                error_message  TEXT,
                created_at     INTEGER NOT NULL,
                completed_at   INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_action_logs_entry_id
                ON action_logs(entry_id);

            CREATE TABLE IF NOT EXISTS app_settings (
                key         TEXT PRIMARY KEY,
                value       TEXT NOT NULL,
                updated_at  INTEGER NOT NULL
            );

            INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
                ('ai.base_url', '', 0),
                ('ai.api_key', '', 0),
                ('ai.model', 'gpt-4o-mini', 0),
                ('shortcut.panel', 'Alt+Space', 0),
                ('privacy.ask_before_send', 'true', 0),
                ('privacy.skip_sensitive', 'false', 0),
                ('ui.max_history', '500', 0);",
        )?;

        // --- Column migrations for databases created by earlier versions -------
        // `CREATE TABLE IF NOT EXISTS` above is a no-op on an existing table, so
        // new columns have to be added explicitly. Guarded by PRAGMA so re-running
        // is safe (SQLite has no `ADD COLUMN IF NOT EXISTS`).
        Self::add_column_if_missing(&conn, "clipboard_entries", "is_pinned", "INTEGER DEFAULT 0")?;

        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_entries_pinned
                ON clipboard_entries(is_pinned DESC, created_at DESC);",
        )?;

        // FTS5 trigram index over clipboard content — MVP Chinese/English substring search.
        // NOTE: detail='full' (not 'none') is required: the trigram tokenizer emits one
        // token per 3-char window, so a MATCH term becomes a phrase query, which FTS5
        // only supports when positional detail is stored.
        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_entries_fts USING fts5(
                content,
                content_preview,
                content_hash UNINDEXED,
                tokenize = 'trigram',
                detail = 'full'
            );",
        )?;

        // One-time backfill so pre-existing v0.1.0 rows are immediately searchable.
        // Guarded by a settings flag → idempotent across app restarts.
        let backfilled = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = 'fts.backfilled'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if backfilled.is_none() {
            conn.execute_batch(
                "INSERT INTO clipboard_entries_fts (content, content_preview, content_hash)
                 SELECT content, content_preview, content_hash
                 FROM clipboard_entries WHERE is_deleted = 0;",
            )?;
            conn.execute(
                "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('fts.backfilled', '1', ?1)",
                rusqlite::params![chrono::Utc::now().timestamp_millis()],
            )?;
        }
        Ok(())
    }

    /// Add `column` to `table` when it does not already exist.
    ///
    /// SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, and the column
    /// name cannot be bound as a parameter, so it is checked via `PRAGMA
    /// table_info` first. Both identifiers are crate-internal constants, never
    /// user input, so the string interpolation is safe.
    fn add_column_if_missing(
        conn: &Connection,
        table: &str,
        column: &str,
        definition: &str,
    ) -> Result<()> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
        let exists = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(Result::ok)
            .any(|name| name == column);
        drop(stmt);

        if !exists {
            conn.execute_batch(&format!(
                "ALTER TABLE {} ADD COLUMN {} {};",
                table, column, definition
            ))?;
        }
        Ok(())
    }
}
