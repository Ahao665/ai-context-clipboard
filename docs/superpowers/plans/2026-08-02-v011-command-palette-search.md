# v0.1.1 Command Palette + Search (Task 19) — Implementation Plan (rev 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade AI Context Clipboard into an **AI Productivity Launcher**: a keyboard-first command palette that (a) searches clipboard history, (b) launches AI actions (总结/翻译/润色/回复/解释) in one keystroke, and (c) quick-pastes any entry back to the clipboard. History browsing remains a first-class entry.

**Architecture:** Keeps the four-layer event-driven architecture. Rust storage layer gains an **MVP FTS5 full-text index** (Chinese + English substring search, sorted by recency — no complex ranking) plus a clipboard write-back command. Core Service layer gains a pure-TS launcher module (fuzzy matching + command registry + result composer, zero React/Tauri deps). UI layer introduces a `CommandPalette` component as the **launcher shell** (search box + two entry modes) while **preserving `HistoryList`/`HistoryItem` as the browse entry**. Alt+Space stays the global show/hide trigger.

**Tech Stack:** Tauri 2 + Rust (rusqlite 0.31 bundled, SQLite ≥3.34 → FTS5 trigram tokenizer) + React 18 + TypeScript 5 + zustand + pnpm. **No new crates or npm packages.** Clipboard write-back reuses the existing `windows` crate (Win32 DataExchange/Memory).

**License:** Apache 2.0

## Global Constraints

- **Core layer (`packages/core/`) must NOT import React, Tauri, or any Rust crate** — launcher module is pure TypeScript (existing rule, from spec).
- **No new dependencies.** FTS5 + trigram come from the already-bundled SQLite inside rusqlite 0.31; clipboard write uses the existing `windows` crate. If the Task 19.1 probe test fails (FTS5 unavailable), fall back to the LIKE path only and flag it.
- **Existing IPC contract must keep working.** `search_entries` extends with optional `offset` + `content_type`; old callers stay valid.
- **Chinese AND English substring search both required.** Sort by recency only — **no bm25 weights, no click-frequency, no behavior learning** (FTS5 stays MVP).
- **DB migration must be idempotent and safe on existing user databases** (v0.1.0 data must remain searchable after upgrade — backfill + `fts.backfilled` flag).
- **HistoryList / HistoryItem are preserved.** CommandPalette is the search/launcher entry; the existing history list is the browse entry. Nothing is deleted.
- **UI text stays Chinese** (existing convention).
- **Search scale:** ≤ 500 entries (`ui.max_history`), 50 results per query default. FTS is chosen for correct Chinese substring matching, not raw scale.
- **TDD:** every task writes the failing test first, runs it (expect fail), implements, re-runs (expect pass), commits. Rust via `cargo test`, core TS via `npx tsx`.
- **v0.1.0 must not be touched.** All changes land on `main` after review; v0.1.1 version bump is the last task.

## Design Decisions (rev 2)

| Question | Decision | Why |
|---|---|---|
| Search entry + browse entry | **Two cooperating entries in one window.** Search box is pinned on top, autofocused on show. Query **empty** → **HistoryView** (existing `HistoryList`, kept) = browse. Query **non-empty** → **CommandPalette** results = search + launch. | Preserves the familiar browse experience while adding the launcher. Nothing deleted. |
| CommandPalette positioning | **AI Productivity Launcher**, not a plain search box. Placeholder "输入 AI 命令或搜索剪贴板历史…"; AI commands are always visible (browse mode = clickable quick strip acting on the selected entry; search mode = fuzzy-matched group). | Matches the product goal and review item #2. |
| Quick Paste | **Enter on an entry = copy to clipboard + close the palette** (`set_clipboard` + `hide()`). Shift+Enter = open detail view (AI actions). Click on a row in browse mode = open detail (old behavior). | Review item #3 — the primary "pick and paste" flow, Raycast-like. |
| AI Action integration | Palette triggers the 5 actions (summarize/translate/polish/reply/explain). Activating a command → navigate to the target entry's detail view and run the action there (reuses existing `AIResultView` + privacy flow). `ActionBar` in detail view stays. | Review item #4 — one-keystroke AI. Reuses existing UI, no new result surface. |
| FTS5 upgrade? | **Yes — FTS5 `trigram` tokenizer, MVP scope.** Chinese + English substring search, `ORDER BY created_at DESC`. `LIKE` fallback for queries < 3 bytes. | Review item #5. `LIKE '%…%'` works for Chinese but full-scans large TEXT every keystroke. FTS5 trigram (bundled, zero deps) makes 1 Chinese char (3 bytes) match. No bm25/complex ranking this release. |
| Window style | **Single window reused as the launcher**, keep native decorations; add `alwaysOnTop: true` | Frameless always-on-top overlay is a bigger, riskier change (custom drag/close/shadow) → v0.2. |
| Trigger shortcut | Alt+Space stays; launcher autofocuses search on show | `Ctrl+K` needs a new global binding + conflict handling; autofocus achieves the same UX for free. |

## Interaction Spec

**Open:** Alt+Space → window shows → search box focused automatically.

**Browse mode (query empty):**
```
🔍 输入 AI 命令或搜索剪贴板历史…      ← autofocused
──────────────────────────────
AI 命令  (对选中的条目执行，点击触发)
  🤖 总结   🤖 翻译   🤖 润色   🤖 回复   🤖 解释
──────────────────────────────
剪贴板历史  (HistoryList, 浏览)
  📝 <preview>       ← ↓/↑ 移动高亮
  ...
──────────────────────────────
Enter 复制到剪贴板 · Shift+Enter 打开 · 输入命令启动 AI · Esc 关闭
```
- ↓/↑ move highlight across the history list (store `selectedId`; auto-select first entry on load).
- **Enter** → Quick Paste selected entry (copy + hide window).
- **Shift+Enter** → open detail view.
- **Click a history row** → open detail view (v0.1.0 behavior preserved).
- **Click an AI command** → run that action on the selected entry (privacy flow applies).
- **Type anything** → switches to Search mode.

**Search mode (query non-empty):**
```
🔍 总结                                    ← 正在搜索…
──────────────────────────────
AI 命令  (模糊匹配)
  🤖 总结   摘要/要点
──────────────────────────────
剪贴板历史  (FTS 匹配, 按时间新→旧)
  📝 <matched preview>
──────────────────────────────
↑↓ 选择 · Enter 复制/执行 · Shift+Enter 打开 · Esc 清空(再按关闭)
```
- ↑↓ move over the flattened [AI 命令 + 剪贴板历史] list.
- **Enter on AI 命令** → open target entry detail + run the action.
- **Enter on 剪贴板历史** → Quick Paste (copy + hide).
- **Shift+Enter** on a history row → open detail.
- **Esc** → clear query (back to browse); **Esc again** → hide window.

---

## File Structure Map (rev 2)

```
src-tauri/
├── Cargo.toml                          # MODIFY: version 0.1.1
├── tauri.conf.json                     # MODIFY: version 0.1.1, window alwaysOnTop
└── src/
    ├── lib.rs                          # MODIFY: register set_clipboard command
    ├── clipboard/
    │   ├── mod.rs                      # MODIFY: add writer module
    │   ├── watcher.rs                  # MODIFY: make get_clipboard_text pub(crate)
    │   └── writer.rs                   # CREATE: write_clipboard_text (Win32)
    ├── commands/
    │   ├── mod.rs                      # MODIFY: add clipboard command module
    │   ├── storage.rs                  # MODIFY: search_entries signature (+offset,+content_type)
    │   └── clipboard.rs                # CREATE: set_clipboard command
    └── storage/
        ├── db.rs                       # MODIFY: FTS5 table + idempotent backfill
        └── entries.rs                  # MODIFY: row_to_entry helper; save/delete sync FTS;
                                        #         search_entries → FTS + LIKE fallback + filters

packages/
├── types/
│   ├── package.json                    # MODIFY: version 0.1.1
│   └── src/
│       ├── index.ts                    # MODIFY: export palette.ts
│       └── palette.ts                  # CREATE: PaletteCommand / PaletteItem / PaletteComposeResult
├── core/
│   ├── package.json                    # MODIFY: version 0.1.1
│   ├── __tests__/
│   │   ├── fuzzy.test.ts               # CREATE
│   │   └── palette-search.test.ts      # CREATE
│   └── src/
│       ├── index.ts                    # MODIFY: export palette module
│       └── palette/
│           ├── fuzzy.ts                # CREATE: fuzzyMatch scorer
│           ├── commands.ts             # CREATE: PALETTE_COMMANDS registry (5 AI actions)
│           └── search.ts               # CREATE: composePaletteResults
└── ui/
    ├── package.json                    # MODIFY: version 0.1.1
    └── src/
        ├── App.tsx                     # MODIFY: render CommandPalette, command→runner map,
        │                               #         Quick Paste handler, auto-select first entry
        ├── App.css                     # MODIFY: launcher/palette styles
        ├── components/
        │   ├── CommandPalette.tsx      # CREATE: launcher shell — input + browse/search modes
        │   ├── HistoryList.tsx         # KEEP (browse entry, unchanged)
        │   └── HistoryItem.tsx         # KEEP (browse entry, unchanged)
        ├── hooks/
        │   └── usePaletteSearch.ts     # CREATE: 150ms debounce around runSearch
        ├── lib/
        │   └── tauri-api.ts            # MODIFY: searchEntries(+offset,+contentType), setClipboard
        └── stores/
            └── clipboard-store.ts      # MODIFY: query/searchResults/searching + request-seq guard
```

---

### Task 19.1: FTS5 search backend — MVP (storage + command + IPC wrapper)

**Goal:** Chinese + English substring search sorted by recency, with a LIKE fallback for short queries. FTS5 stays MVP — no bm25, no behavior learning.

**Files:**
- Modify: `src-tauri/src/storage/db.rs`
- Modify: `src-tauri/src/storage/entries.rs`
- Modify: `src-tauri/src/commands/storage.rs`
- Modify: `packages/ui/src/lib/tauri-api.ts`

**Interfaces:**
- Produces: `Database::search_entries(&self, query: &str, limit: i64, offset: i64, content_type: Option<&str>) -> rusqlite::Result<Vec<ClipboardEntry>>` — empty query → recent list; `<3`-byte query → LIKE fallback; otherwise FTS5 `MATCH`. All paths `ORDER BY created_at DESC`.
- Produces: Tauri command `search_entries(query: String, limit: Option<i64>, offset: Option<i64>, content_type: Option<String>)`.
- Consumes: existing `ClipboardEntry` struct, `Database::new` migration path.

- [ ] **Step 1: Write the failing FTS5 probe + behavior tests**

Append to `src-tauri/src/storage/entries.rs` test module:

```rust
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test storage::entries::tests::test_search_chinese_substring -- --nocapture`
Expected: FAIL to compile (`search_entries` still has the old 2-arg signature) or fail at runtime (no FTS matching). Either is the expected red state.

- [ ] **Step 3: Implement FTS5 schema + idempotent backfill**

Modify `src-tauri/src/storage/db.rs` `migrate()`. Add `use rusqlite::OptionalExtension;` at the top. After the existing `conn.execute_batch(...)` (which creates `clipboard_entries` etc.), append:

```rust
        // FTS5 trigram index over clipboard content — MVP Chinese/English substring search.
        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_entries_fts USING fts5(
                content,
                content_preview,
                content_hash UNINDEXED,
                tokenize = 'trigram',
                detail = 'none'
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
```

- [ ] **Step 4: Implement FTS-synced save/delete + new search**

Modify `src-tauri/src/storage/entries.rs`:

1. Add a shared row mapper (replaces the three duplicated `Ok(ClipboardEntry { ... })` blocks):

```rust
fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClipboardEntry> {
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
```

2. In `save_entry`, after the existing `INSERT OR REPLACE INTO clipboard_entries`, keep the FTS index in sync:

```rust
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
```

3. In `delete_entry`, after the soft-delete UPDATE:

```rust
        conn.execute(
            "DELETE FROM clipboard_entries_fts
             WHERE content_hash IN (SELECT content_hash FROM clipboard_entries WHERE id = ?1)",
            params![id],
        )?;
        Ok(())
```

4. Replace the whole `search_entries` body (and add the `search_like` helper). Add `use rusqlite::{params, Connection};` to the imports:

```rust
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
            let rows = stmt.query_map(params![content_type, limit, offset], |row| row_to_entry(row))?;
            return rows.collect();
        }

        // Queries shorter than 3 bytes can't build trigrams → LIKE fallback.
        if trimmed.len() < 3 {
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
            let rows = stmt
                .query_map(params![match_query, content_type, limit, offset], |row| row_to_entry(row))?;
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
            .query_map(params![pattern, content_type, limit, offset], |row| row_to_entry(row))?;
        rows.collect()
    }
```

- [ ] **Step 5: Update the Tauri command signature**

Replace `src-tauri/src/commands/storage.rs` `search_entries`:

```rust
#[tauri::command]
pub fn search_entries(
    db: State<'_, Database>,
    query: String,
    limit: Option<i64>,
    offset: Option<i64>,
    content_type: Option<String>,
) -> Result<Vec<ClipboardEntry>, String> {
    db.search_entries(&query, limit.unwrap_or(50), offset.unwrap_or(0), content_type.as_deref())
        .map_err(|e| e.to_string())
}
```

`lib.rs` already registers `commands::storage::search_entries` — no change needed there.

- [ ] **Step 6: Update the TS IPC wrapper**

Replace `searchEntries` in `packages/ui/src/lib/tauri-api.ts`:

```ts
export async function searchEntries(
  query: string,
  limit?: number,
  offset?: number,
  contentType?: ContentType,
): Promise<ClipboardEntry[]> {
  return invoke('search_entries', {
    query,
    limit: limit ?? 50,
    offset: offset ?? 0,
    contentType,
  });
}
```

Add `ContentType` to the existing `import type { ClipboardEntry, AIProviderConfig }` line.

- [ ] **Step 7: Run all Rust tests**

Run: `cd src-tauri && cargo test`
Expected: all existing tests still pass, plus the 10 new FTS tests pass. Watch specifically for `test_fts_trigram_available`, `test_search_chinese_substring`, and `test_search_english_substring`.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/storage/db.rs src-tauri/src/storage/entries.rs src-tauri/src/commands/storage.rs packages/ui/src/lib/tauri-api.ts
git commit -m "feat: MVP FTS5 trigram search with recency sort and LIKE fallback"
```

---

### Task 19.2: Clipboard write-back command

**Goal:** Add a `set_clipboard` Tauri command so Quick Paste can copy an entry back to the system clipboard.

**Files:**
- Create: `src-tauri/src/clipboard/writer.rs`
- Modify: `src-tauri/src/clipboard/mod.rs`
- Modify: `src-tauri/src/clipboard/watcher.rs` (make reader `pub(crate)` for the round-trip test)
- Create: `src-tauri/src/commands/clipboard.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `packages/ui/src/lib/tauri-api.ts`

**Interfaces:**
- Produces: `pub fn write_clipboard_text(text: &str) -> bool` (Windows), command `set_clipboard(text: String) -> Result<(), String>`, TS `setClipboard(text: string): Promise<void>`.

- [ ] **Step 1: Write the failing round-trip test**

Create `src-tauri/src/clipboard/writer.rs`:

```rust
#[cfg(target_os = "windows")]
pub fn write_clipboard_text(text: &str) -> bool {
    unsafe {
        use windows::Win32::Foundation::HANDLE;
        use windows::Win32::System::DataExchange::{
            CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
        };
        use windows::Win32::System::Memory::{
            GlobalAlloc, GlobalFree, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
        };

        if OpenClipboard(None).is_err() {
            return false;
        }

        // CF_UNICODETEXT = 13; null-terminated UTF-16 buffer.
        let utf16: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let size = utf16.len() * 2;

        let h = GlobalAlloc(GMEM_MOVEABLE, size);
        if h.is_invalid() {
            let _ = CloseClipboard();
            return false;
        }

        let ptr = GlobalLock(h);
        if ptr.is_null() {
            let _ = GlobalFree(h);
            let _ = CloseClipboard();
            return false;
        }
        std::ptr::copy_nonoverlapping(utf16.as_ptr(), ptr as *mut u16, utf16.len());
        let _ = GlobalUnlock(h);

        if EmptyClipboard().is_err() {
            let _ = GlobalFree(h);
            let _ = CloseClipboard();
            return false;
        }

        let ok = SetClipboardData(13, HANDLE(h.0)).is_ok();
        let _ = CloseClipboard();
        ok
    }
}

#[cfg(not(target_os = "windows"))]
pub fn write_clipboard_text(_text: &str) -> bool {
    false
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_write_roundtrip() {
        let text = "hello 剪贴板";
        assert!(super::write_clipboard_text(text), "write should succeed");
        let read = crate::clipboard::watcher::get_clipboard_text();
        assert_eq!(read.text.as_deref(), Some(text));
    }
}
```

- [ ] **Step 2: Run test to verify it fails to compile**

Run: `cd src-tauri && cargo test writer`
Expected: FAIL — `writer` module not declared; `get_clipboard_text` is private.

- [ ] **Step 3: Wire module, expose reader, add command**

`src-tauri/src/clipboard/mod.rs`:
```rust
pub mod watcher;
pub mod writer;
pub use watcher::*;
pub use writer::*;
```

In `src-tauri/src/clipboard/watcher.rs`, change `fn get_clipboard_text` to `pub(crate) fn get_clipboard_text` (both the `#[cfg(target_os = "windows")]` and `#[cfg(not(target_os = "windows"))]` versions).

Create `src-tauri/src/commands/clipboard.rs`:
```rust
use crate::clipboard::write_clipboard_text;

#[tauri::command]
pub fn set_clipboard(text: String) -> Result<(), String> {
    if write_clipboard_text(&text) {
        Ok(())
    } else {
        Err("写入剪贴板失败".into())
    }
}
```

`src-tauri/src/commands/mod.rs`:
```rust
pub mod clipboard;
pub mod settings;
pub mod storage;
```

`src-tauri/src/lib.rs` — add `commands::clipboard::set_clipboard` to the `invoke_handler!` list.

- [ ] **Step 4: Run test + add TS wrapper**

Run: `cd src-tauri && cargo test writer`
Expected: PASS (round-trip writes then reads back the same text). Note: this touches the real system clipboard; reliable on a local Windows machine. If CI proves flaky, `#[ignore]` the test — the command itself is unaffected.

Add to `packages/ui/src/lib/tauri-api.ts`:
```ts
export async function setClipboard(text: string): Promise<void> {
  await invoke('set_clipboard', { text });
}
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/clipboard/writer.rs src-tauri/src/clipboard/mod.rs src-tauri/src/clipboard/watcher.rs src-tauri/src/commands/clipboard.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs packages/ui/src/lib/tauri-api.ts
git commit -m "feat: add clipboard write-back command"
```

---

### Task 19.3: Core launcher module (pure TypeScript)

**Goal:** Fuzzy matching + a command registry + a result composer — all in `packages/core`, zero framework deps, fully unit-tested. This is the "AI Productivity Launcher" logic layer.

**Files:**
- Create: `packages/types/src/palette.ts`
- Modify: `packages/types/src/index.ts`
- Create: `packages/core/src/palette/fuzzy.ts`
- Create: `packages/core/src/palette/commands.ts`
- Create: `packages/core/src/palette/search.ts`
- Create: `packages/core/__tests__/fuzzy.test.ts`
- Create: `packages/core/__tests__/palette-search.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `fuzzyMatch(query: string, text: string): { score: number; indices: number[] } | null`
  - `PALETTE_COMMANDS: PaletteCommand[]` (5 AI actions)
  - `composePaletteResults(query: string, entries: ClipboardEntry[], commands: PaletteCommand[]): PaletteComposeResult`
- Consumes: `PaletteCommand`, `PaletteComposeResult`, `ClipboardEntry`, `ActionId` from `@ai-clipboard/types`.

- [ ] **Step 1: Define palette types**

Create `packages/types/src/palette.ts`:
```ts
import type { ActionId } from './actions';
import type { ClipboardEntry } from './clipboard';

export interface PaletteCommand {
  id: string;
  actionId: ActionId;
  label: string;
  description: string;
  keywords: string[];
  category: string;
}

export type PaletteItem =
  | { kind: 'command'; command: PaletteCommand; score: number }
  | { kind: 'entry'; entry: ClipboardEntry; score: number };

export interface PaletteComposeResult {
  commands: PaletteItem[];
  entries: PaletteItem[];
  topEntry: ClipboardEntry | null;
}
```

Modify `packages/types/src/index.ts`:
```ts
export * from './palette';
```

- [ ] **Step 2: Write failing fuzzy tests**

Create `packages/core/__tests__/fuzzy.test.ts` (follows the repo's tsx + `console.assert` + `main()` convention):

```ts
import { fuzzyMatch } from '../src/palette/fuzzy';

function test_empty_query() {
  const m = fuzzyMatch('', 'anything');
  console.assert(m !== null && m.score === 0, 'empty query matches with score 0');
  console.log('✅ test_empty_query passed');
}

function test_exact_prefix_high_score() {
  const a = fuzzyMatch('sum', 'summarize');
  const b = fuzzyMatch('sum', 'discuss summary');
  console.assert(a !== null && b !== null, 'both should match');
  console.assert(a!.score > b!.score, 'prefix match should score higher than later match');
  console.log('✅ test_exact_prefix_high_score passed');
}

function test_subsequence_match() {
  const m = fuzzyMatch('sma', 'summarize');
  console.assert(m !== null, 'subsequence should match');
  console.assert(m!.indices.length === 3, 'should track matched indices');
  console.log('✅ test_subsequence_match passed');
}

function test_case_insensitive() {
  const m = fuzzyMatch('SUM', 'summarize');
  console.assert(m !== null, 'matching should be case-insensitive');
  console.log('✅ test_case_insensitive passed');
}

function test_chinese_subsequence() {
  const m = fuzzyMatch('总', '总结');
  console.assert(m !== null, 'single Chinese char should match');
  const m2 = fuzzyMatch('润', '润色');
  console.assert(m2 !== null, 'Chinese subsequence should match');
  console.log('✅ test_chinese_subsequence passed');
}

function test_no_match_returns_null() {
  const m = fuzzyMatch('xyz', 'summarize');
  console.assert(m === null, 'non-subsequence should return null');
  console.log('✅ test_no_match_returns_null passed');
}

function test_consecutive_bonus() {
  const a = fuzzyMatch('foo', 'afoox');
  const b = fuzzyMatch('foo', 'afxoo');
  console.assert(a !== null && b !== null, 'both should match');
  console.assert(a!.score > b!.score, 'consecutive chars should outscore scattered chars');
  console.log('✅ test_consecutive_bonus passed');
}

async function main() {
  const tests = [
    test_empty_query,
    test_exact_prefix_high_score,
    test_subsequence_match,
    test_case_insensitive,
    test_chinese_subsequence,
    test_no_match_returns_null,
    test_consecutive_bonus,
  ];
  let passed = 0;
  let failed = 0;
  for (const test of tests) {
    try { test(); passed++; }
    catch (err) { console.error(`❌ ${test.name} failed:`, err); failed++; }
  }
  console.log(`\n---\nResults: ${passed}/${tests.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
```

- [ ] **Step 3: Run fuzzy tests to verify they fail**

Run: `npx tsx packages/core/__tests__/fuzzy.test.ts`
Expected: FAIL — cannot find module `../src/palette/fuzzy`.

- [ ] **Step 4: Implement fuzzy scorer**

Create `packages/core/src/palette/fuzzy.ts`:

```ts
export interface FuzzyMatch {
  score: number;
  indices: number[];
}

/**
 * Score a fuzzy (subsequence) match of `query` inside `text`.
 * Higher score = better match. Returns null when not every query char
 * appears in `text` in order. Case-insensitive; works on code points,
 * so Chinese characters match naturally.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLocaleLowerCase();
  const t = text.toLocaleLowerCase();
  if (!q) return { score: 0, indices: [] };

  let qi = 0;
  let last = -2;
  let score = 0;
  const indices: number[] = [];

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Consecutive runs are worth much more than scattered matches.
      score += ti === last + 1 ? 8 : 1;
      last = ti;
      indices.push(ti);
      qi++;
    }
  }

  if (qi < q.length) return null; // not a subsequence

  // Prefix matches are the strongest signal.
  if (indices[0] === 0) score += 12;

  // Penalize gaps between matched characters.
  for (let i = 1; i < indices.length; i++) {
    score -= (indices[i] - indices[i - 1] - 1) * 2;
  }

  // Slight bonus for matching the full string (no trailing noise).
  if (t.length === q.length) score += 6;

  return { score, indices };
}
```

- [ ] **Step 5: Run fuzzy tests to verify they pass**

Run: `npx tsx packages/core/__tests__/fuzzy.test.ts`
Expected: `Results: 7/7 passed, 0 failed`

- [ ] **Step 6: Write failing palette-search tests**

Create `packages/core/__tests__/palette-search.test.ts`:

```ts
import { composePaletteResults } from '../src/palette/search';
import { PALETTE_COMMANDS } from '../src/palette/commands';
import type { ClipboardEntry } from '@ai-clipboard/types';

function entry(id: string, preview: string): ClipboardEntry {
  return {
    id,
    content_hash: `h-${id}`,
    content_type: 'text',
    content: preview,
    content_preview: preview,
    content_storage: 'inline',
    content_size: preview.length,
    is_deleted: false,
    created_at: 1,
    updated_at: 1,
  };
}

function test_empty_query_lists_all_commands() {
  const r = composePaletteResults('', [entry('e1', 'hello')], PALETTE_COMMANDS);
  console.assert(r.commands.length === PALETTE_COMMANDS.length, 'empty query shows all commands');
  console.assert(r.entries.length === 1, 'empty query shows all entries');
  console.assert(r.topEntry?.id === 'e1', 'top entry is the first entry');
  console.log('✅ test_empty_query_lists_all_commands passed');
}

function test_filters_commands_by_query() {
  const r = composePaletteResults('翻', [], PALETTE_COMMANDS);
  const labels = r.commands.map((c) => c.command.label);
  console.assert(labels.includes('翻译'), '翻译 should match 翻');
  console.assert(labels.includes('总结') === false, '总结 should NOT match 翻');
  console.log('✅ test_filters_commands_by_query passed');
}

function test_matches_english_keyword() {
  const r = composePaletteResults('polish', [], PALETTE_COMMANDS);
  const labels = r.commands.map((c) => c.command.label);
  console.assert(labels.includes('润色'), 'English keyword should match 润色');
  console.log('✅ test_matches_english_keyword passed');
}

function test_no_match_commands_empty() {
  const r = composePaletteResults('qqzz', [], PALETTE_COMMANDS);
  console.assert(r.commands.length === 0, 'no command should match');
  console.log('✅ test_no_match_commands_empty passed');
}

function test_entries_preserve_backend_order() {
  const r = composePaletteResults('', [entry('a', 'first'), entry('b', 'second')], []);
  console.assert(r.entries[0].entry.id === 'a', 'entry order preserved');
  console.assert(r.entries[1].entry.id === 'b', 'entry order preserved');
  console.assert(r.topEntry?.id === 'a', 'top entry first');
  console.log('✅ test_entries_preserve_backend_order passed');
}

async function main() {
  const tests = [
    test_empty_query_lists_all_commands,
    test_filters_commands_by_query,
    test_matches_english_keyword,
    test_no_match_commands_empty,
    test_entries_preserve_backend_order,
  ];
  let passed = 0;
  let failed = 0;
  for (const test of tests) {
    try { test(); passed++; }
    catch (err) { console.error(`❌ ${test.name} failed:`, err); failed++; }
  }
  console.log(`\n---\nResults: ${passed}/${tests.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
```

- [ ] **Step 7: Run to verify they fail**

Run: `npx tsx packages/core/__tests__/palette-search.test.ts`
Expected: FAIL — cannot find `../src/palette/search` / `../src/palette/commands`.

- [ ] **Step 8: Implement command registry + composer**

Create `packages/core/src/palette/commands.ts`:
```ts
import type { PaletteCommand } from '@ai-clipboard/types';

/** The 5 AI actions, exposed as launchable palette commands. */
export const PALETTE_COMMANDS: PaletteCommand[] = [
  { id: 'summarize', actionId: 'text.summarize', label: '总结', description: '提取内容要点', keywords: ['总结', 'summarize', '概要', 'zj'], category: 'AI' },
  { id: 'translate', actionId: 'text.translate', label: '翻译', description: '翻译为中文', keywords: ['翻译', 'translate', 'fanyi'], category: 'AI' },
  { id: 'rewrite', actionId: 'text.polish', label: '润色', description: '改进表达和语法', keywords: ['润色', 'rewrite', 'polish', '改写'], category: 'AI' },
  { id: 'reply', actionId: 'text.reply', label: '回复', description: '生成自然回复', keywords: ['回复', 'reply', 'huifu'], category: 'AI' },
  { id: 'explain', actionId: 'text.explain', label: '解释', description: '用简单语言解释', keywords: ['解释', 'explain', 'jieshi'], category: 'AI' },
];
```

Create `packages/core/src/palette/search.ts`:
```ts
import { fuzzyMatch } from './fuzzy';
import type {
  ClipboardEntry,
  PaletteCommand,
  PaletteComposeResult,
} from '@ai-clipboard/types';

/**
 * Merge fuzzy-matched AI commands with pre-ranked clipboard entries into
 * two ordered groups. `entries` must already be sorted by the backend
 * (recency) — positional order is preserved as the entry score.
 */
export function composePaletteResults(
  query: string,
  entries: ClipboardEntry[],
  commands: PaletteCommand[],
): PaletteComposeResult {
  const trimmed = query.trim();

  const commandItems = trimmed
    ? commands
        .map((command) => {
          const haystack = `${command.label} ${command.keywords.join(' ')}`;
          const match = fuzzyMatch(trimmed, haystack);
          return match ? { command, score: match.score } : null;
        })
        .filter((x): x is { command: PaletteCommand; score: number } => x !== null)
        .sort((a, b) => b.score - a.score)
        .map(({ command, score }) => ({ kind: 'command' as const, command, score }))
    : commands.map((command) => ({ kind: 'command' as const, command, score: 0 }));

  const entryItems = entries.map((entry, index) => ({
    kind: 'entry' as const,
    entry,
    score: 1_000_000 - index,
  }));

  return {
    commands: commandItems,
    entries: entryItems,
    topEntry: entries[0] ?? null,
  };
}
```

Modify `packages/core/src/index.ts`:
```ts
export { fuzzyMatch } from './palette/fuzzy';
export { PALETTE_COMMANDS } from './palette/commands';
export { composePaletteResults } from './palette/search';
```

- [ ] **Step 9: Run all palette tests to verify they pass**

Run: `npx tsx packages/core/__tests__/fuzzy.test.ts && npx tsx packages/core/__tests__/palette-search.test.ts`
Expected: both print `Results: N/N passed, 0 failed`.

- [ ] **Step 10: Commit**

```bash
git add packages/types/src/palette.ts packages/types/src/index.ts packages/core/src/palette/ packages/core/__tests__/fuzzy.test.ts packages/core/__tests__/palette-search.test.ts packages/core/src/index.ts
git commit -m "feat: add core launcher module (fuzzy match + command registry + compose)"
```

---

### Task 19.4: UI search state (store + debounced hook)

**Goal:** Wire the launcher's query state to the FTS backend with debounce and stale-response protection.

**Files:**
- Modify: `packages/ui/src/stores/clipboard-store.ts`
- Create: `packages/ui/src/hooks/usePaletteSearch.ts`

**Interfaces:**
- Produces: store fields `query`, `searchResults`, `searching`, `requestSeq`; actions `setQuery(q)`, `runSearch()`, `clearQuery()`. Existing `setSelected` used for browse highlight. Hook `usePaletteSearch()` (150 ms debounce).
- Consumes: `searchEntries` from `../lib/tauri-api`.

- [ ] **Step 1: Update the store (no separate test harness — covered by typecheck + E2E)**

Replace `packages/ui/src/stores/clipboard-store.ts`:

```ts
import { create } from 'zustand';
import type { ClipboardEntry } from '@ai-clipboard/types';
import { searchEntries } from '../lib/tauri-api';

interface ClipboardState {
  entries: ClipboardEntry[];
  loading: boolean;
  selectedId: string | null;
  query: string;
  searchResults: ClipboardEntry[];
  searching: boolean;
  requestSeq: number;
  setEntries: (entries: ClipboardEntry[]) => void;
  addEntry: (entry: ClipboardEntry) => void;
  removeEntry: (id: string) => void;
  setSelected: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setQuery: (query: string) => void;
  runSearch: () => Promise<void>;
  clearQuery: () => void;
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  entries: [],
  loading: false,
  selectedId: null,
  query: '',
  searchResults: [],
  searching: false,
  requestSeq: 0,
  setEntries: (entries) => set({ entries }),
  addEntry: (entry) =>
    set((s) => ({ entries: [entry, ...s.entries].slice(0, 500) })),
  removeEntry: (id) =>
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
  setSelected: (id) => set({ selectedId: id }),
  setLoading: (loading) => set({ loading }),
  setQuery: (query) => set({ query }),
  runSearch: async () => {
    const seq = get().requestSeq + 1;
    set({ requestSeq: seq, searching: true });
    const trimmed = get().query.trim();
    if (!trimmed) {
      set({ searchResults: [], searching: false });
      return;
    }
    const results = await searchEntries(trimmed, 50, 0);
    // Drop stale responses that arrive after a newer query started.
    if (get().requestSeq === seq) {
      set({ searchResults: results, searching: false });
    }
  },
  clearQuery: () => set({ query: '', searchResults: [], searching: false }),
}));
```

Create `packages/ui/src/hooks/usePaletteSearch.ts`:
```ts
import { useEffect } from 'react';
import { useClipboardStore } from '../stores/clipboard-store';

const DEBOUNCE_MS = 150;

/** Debounce query changes so each keystroke does not hit the FTS backend. */
export function usePaletteSearch() {
  const { query, runSearch } = useClipboardStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (0 errors across all three packages).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/stores/clipboard-store.ts packages/ui/src/hooks/usePaletteSearch.ts
git commit -m "feat: add debounced palette search state"
```

---

### Task 19.5: CommandPalette launcher shell + App integration

**Goal:** Introduce the launcher shell with two entry modes — browse (preserved `HistoryList`) and search (grouped results) — plus Quick Paste and AI-action routing. **HistoryList/HistoryItem are NOT deleted.**

**Files:**
- Create: `packages/ui/src/components/CommandPalette.tsx`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/App.css`

**Interfaces:**
- Consumes: `composePaletteResults`, `PALETTE_COMMANDS` from `@ai-clipboard/core`; store state/actions from 19.4; `usePaletteSearch`; `HistoryList`; `getCurrentWindow` from `@tauri-apps/api/window`.
- Produces: `CommandPalette({ onQuickPaste, onOpenDetail, onRunCommand, onHide })`.

- [ ] **Step 1: Write the CommandPalette component**

Create `packages/ui/src/components/CommandPalette.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { composePaletteResults, PALETTE_COMMANDS } from '@ai-clipboard/core';
import type { ActionId, ClipboardEntry, PaletteItem } from '@ai-clipboard/types';
import { useClipboardStore } from '../stores/clipboard-store';
import { HistoryList } from './HistoryList';
import { usePaletteSearch } from '../hooks/usePaletteSearch';

const TYPE_ICON: Record<string, string> = {
  text: '📝',
  code: '💻',
  url: '🔗',
  json: '📊',
  email: '✉️',
  unknown: '📋',
};

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RowProps {
  icon: string;
  title: string;
  subtitle: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}

function PaletteRow({ icon, title, subtitle, hint, selected, onClick }: RowProps) {
  return (
    <div
      className={`palette-row ${selected ? 'selected' : ''}`}
      onClick={onClick}
      onMouseEnter={onClick}
    >
      <span className="palette-row-icon">{icon}</span>
      <div className="palette-row-body">
        <div className="palette-row-title">{title}</div>
        <div className="palette-row-subtitle">
          {subtitle}
          {hint ? <span className="palette-row-hint">{hint}</span> : null}
        </div>
      </div>
    </div>
  );
}

interface Props {
  onQuickPaste: (entry: ClipboardEntry) => void; // Enter: copy + close
  onOpenDetail: (id: string) => void; // Shift+Enter / click: open detail
  onRunCommand: (commandId: string, actionId: ActionId, target: ClipboardEntry | null) => void;
  onHide: () => void;
}

export function CommandPalette({ onQuickPaste, onOpenDetail, onRunCommand, onHide }: Props) {
  const {
    entries,
    query,
    searchResults,
    searching,
    selectedId,
    setSelected,
    setQuery,
    clearQuery,
  } = useClipboardStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  usePaletteSearch();

  const isSearching = query.trim().length > 0;
  const pool = isSearching ? searchResults : entries;

  const { commands, entries: entryItems, topEntry } = useMemo(
    () => composePaletteResults(query, pool, PALETTE_COMMANDS),
    [query, pool],
  );

  // Search mode: flattened [commands..., entries...] for unified navigation.
  const flat: PaletteItem[] = useMemo(() => [...commands, ...entryItems], [commands, entryItems]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, pool]);

  // Autofocus on mount and whenever the window regains focus (Alt+Space show).
  useEffect(() => {
    inputRef.current?.focus();
    let unlisten: (() => void) | null = null;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) inputRef.current?.focus();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, []);

  // Browse mode: the highlighted history row (store-selected) or the first entry.
  const browseTarget = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? entries[0] ?? null,
    [entries, selectedId],
  );

  const moveBrowseSelection = useCallback(
    (delta: number) => {
      if (!entries.length) return;
      const idx = entries.findIndex((e) => e.id === selectedId);
      const next = Math.max(0, Math.min(entries.length - 1, (idx < 0 ? 0 : idx) + delta));
      setSelected(entries[next].id);
    },
    [entries, selectedId, setSelected],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (query) {
        clearQuery();
      } else {
        onHide();
      }
      return;
    }

    if (!isSearching) {
      // Browse mode
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveBrowseSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveBrowseSelection(-1);
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        if (browseTarget) onOpenDetail(browseTarget.id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (browseTarget) onQuickPaste(browseTarget);
      }
      return;
    }

    // Search mode
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((s) => Math.min(s + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      const item = flat[selectedIndex];
      if (item?.kind === 'entry') onOpenDetail(item.entry.id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[selectedIndex];
      if (!item) return;
      if (item.kind === 'command') {
        onRunCommand(item.command.id, item.command.actionId, topEntry);
      } else {
        onQuickPaste(item.entry);
      }
    }
  };

  return (
    <div className="palette">
      <input
        ref={inputRef}
        className="search-input"
        placeholder="输入 AI 命令或搜索剪贴板历史…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      {isSearching ? (
        <>
          {searching && <div className="palette-status">搜索中…</div>}
          <div className="palette-results">
            {commands.length > 0 && (
              <>
                <div className="palette-group-title">AI 命令</div>
                {commands.map((item, i) => (
                  <PaletteRow
                    key={`cmd-${item.command.id}`}
                    icon="🤖"
                    title={item.command.label}
                    subtitle={item.command.description}
                    hint={topEntry ? `对「${topEntry.content_preview.slice(0, 20)}…」执行` : '无可用条目'}
                    selected={i === selectedIndex}
                    onClick={() => onRunCommand(item.command.id, item.command.actionId, topEntry)}
                  />
                ))}
              </>
            )}
            {entryItems.length > 0 && (
              <>
                <div className="palette-group-title">剪贴板历史</div>
                {entryItems.map((item, i) => {
                  const j = commands.length + i;
                  return (
                    <PaletteRow
                      key={`ent-${item.entry.id}`}
                      icon={TYPE_ICON[item.entry.content_type] || '📋'}
                      title={item.entry.content_preview || '(empty)'}
                      subtitle={formatTime(item.entry.created_at)}
                      hint="Enter 复制"
                      selected={j === selectedIndex}
                      onClick={() => onQuickPaste(item.entry)}
                    />
                  );
                })}
              </>
            )}
            {commands.length === 0 && entryItems.length === 0 && !searching && (
              <div className="history-status">无匹配结果</div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="palette-results">
            <div className="palette-group-title">AI 命令（对选中的条目执行）</div>
            <div className="palette-commands-strip">
              {PALETTE_COMMANDS.map((command) => (
                <button
                  key={command.id}
                  className="palette-command-chip"
                  title={command.description}
                  onClick={() => onRunCommand(command.id, command.actionId, browseTarget)}
                >
                  🤖 {command.label}
                </button>
              ))}
            </div>
            <div className="palette-group-title">剪贴板历史</div>
            <HistoryList
              onSelect={(id) => {
                setSelected(id);
                onOpenDetail(id);
              }}
            />
          </div>
        </>
      )}

      <div className="palette-footer">
        {isSearching
          ? '↑↓ 选择 · Enter 复制/执行 · Shift+Enter 打开 · Esc 清空'
          : 'Enter 复制到剪贴板 · Shift+Enter 打开 · 输入命令启动 AI · Esc 关闭'}
      </div>
    </div>
  );
}
```

> Note: in browse mode, `HistoryList`'s `onSelect` fires on click and opens the detail view (v0.1.0 behavior preserved); the store `selectedId` drives the highlight and the Quick Paste / AI-command target. `onMouseEnter={onClick}` on palette rows keeps mouse + keyboard selection in sync.

- [ ] **Step 2: Integrate into App.tsx**

Modify `packages/ui/src/App.tsx`:

Replace the imports to add `CommandPalette`, `getCurrentWindow`, `setClipboard`, `ActionId`/`ClipboardEntry` types, and remove the `HistoryList` import. Add the handlers. Concretely:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CommandPalette } from './components/CommandPalette';
import { ActionBar } from './components/ActionBar';
import type { ActionBarAction } from './components/ActionBar';
import { AIResultView } from './components/AIResultView';
import { PrivacyDialog } from './components/PrivacyDialog';
import { useClipboard } from './hooks/useClipboard';
import { useAI } from './hooks/useAI';
import { useClipboardStore } from './stores/clipboard-store';
import { useSettingsStore } from './stores/settings-store';
import { setClipboard } from './lib/tauri-api';
import type { ActionId, ClipboardEntry } from '@ai-clipboard/types';
import './App.css';
```

Add inside `App` (after the existing `actions` array and `handleBack`):

```tsx
  // Default the browse highlight to the newest entry so AI commands always have a target.
  const storeSelectedId = useClipboardStore((s) => s.selectedId);
  const storeSetSelected = useClipboardStore((s) => s.setSelected);
  useEffect(() => {
    if (entries.length > 0 && !storeSelectedId) {
      storeSetSelected(entries[0].id);
    }
  }, [entries, storeSelectedId, storeSetSelected]);

  const commandRunners: Record<string, (c: string) => void> = {
    'text.summarize': runSummarize,
    'text.translate': runTranslate,
    'text.polish': runRewrite,
    'text.reply': runReply,
    'text.explain': runExplain,
  };

  const commandLabels: Record<string, string> = {
    'text.summarize': '总结',
    'text.translate': '翻译',
    'text.polish': '润色',
    'text.reply': '回复',
    'text.explain': '解释',
  };

  const handlePaletteCommand = useCallback(
    (_commandId: string, actionId: ActionId, target: ClipboardEntry | null) => {
      const content = target?.content;
      const runner = commandRunners[actionId];
      const label = commandLabels[actionId] ?? actionId;
      if (content && runner) {
        // Show the target in the detail view, then run the action there.
        setSelectedId(target.id);
        withPrivacy(label, () => runner(content));
      }
    },
    [commandRunners, commandLabels, withPrivacy, setSelectedId],
  );

  const handleQuickPaste = useCallback(async (entry: ClipboardEntry) => {
    if (!entry.content) return;
    await setClipboard(entry.content);
    void getCurrentWindow().hide();
  }, []);

  const hideWindow = useCallback(() => {
    void getCurrentWindow().hide();
  }, []);
```

Replace the non-detail render branch:

```tsx
        <>
          <header className="app-header">
            <h1>AI Context Clipboard</h1>
          </header>
          <main className="app-main">
            <CommandPalette
              onQuickPaste={handleQuickPaste}
              onOpenDetail={setSelectedId}
              onRunCommand={handlePaletteCommand}
              onHide={hideWindow}
            />
          </main>
        </>
```

Add a copy button in the detail view header (next to the existing back button):

```tsx
          <header className="app-header">
            <button className="back-btn" onClick={handleBack}>
              ← 返回
            </button>
            <button className="copy-btn" onClick={handleCopy} title="复制到剪贴板">
              复制
            </button>
          </header>
```

where `handleCopy` is the same as `handleQuickPaste` applied to the selected entry (see note in Task 19.6, Step 1).

- [ ] **Step 3: Add palette CSS**

Append to `packages/ui/src/App.css`:

```css
/* --- Command Palette / Launcher --- */

.palette { display: flex; flex-direction: column; height: 100%; }

.palette .search-input {
  flex: 0 0 auto;
  font-size: 14px;
  padding: 10px 14px;
}

.palette-status {
  padding: 4px 16px;
  font-size: 11px;
  color: var(--text-dim);
}

.palette-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.palette-group-title {
  padding: 8px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  letter-spacing: 0.05em;
}

.palette-commands-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 16px 12px;
}

.palette-command-chip {
  padding: 5px 12px;
  border: 1px solid var(--accent);
  border-radius: 20px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.palette-command-chip:hover {
  background: var(--accent);
  color: var(--bg);
}

.palette-row {
  display: flex;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.12s;
}

.palette-row:hover,
.palette-row.selected {
  background: var(--surface2);
}

.palette-row.selected {
  border-left: 3px solid var(--accent);
}

.palette-row-icon { font-size: 16px; line-height: 1.5; }

.palette-row-body { flex: 1; min-width: 0; }

.palette-row-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.palette-row-subtitle {
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.palette-row-hint {
  margin-left: 8px;
  color: var(--accent);
}

.palette-footer {
  flex: 0 0 auto;
  padding: 6px 16px;
  font-size: 11px;
  color: var(--text-dim);
  border-top: 1px solid var(--surface2);
}

.copy-btn {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
  margin-left: auto;
}

.copy-btn:hover { color: var(--text); }
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/CommandPalette.tsx packages/ui/src/App.tsx packages/ui/src/App.css
git commit -m "feat: add command palette launcher with browse/search modes and quick paste"
```

---

### Task 19.6: Detail copy button + window alwaysOnTop + E2E verification

**Goal:** Polish and prove the launcher end-to-end in the running app.

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `packages/ui/src/App.tsx` (add `handleCopy` if not added in 19.5)

**Interfaces:** none new.

- [ ] **Step 1: Add the detail copy handler**

If not already added in Task 19.5, add to `App.tsx`:

```tsx
  const handleCopy = useCallback(async () => {
    if (selectedEntry?.content) {
      await setClipboard(selectedEntry.content);
    }
  }, [selectedEntry]);
```

- [ ] **Step 2: Set the window always-on-top**

In `src-tauri/tauri.conf.json`, inside the single window object add:

```json
    "alwaysOnTop": true
```

(Rationale: the window is only visible when summoned by Alt+Space; floating above other apps matches launcher expectations. Native decorations remain for v0.1.1.)

- [ ] **Step 3: Verify the full test suite**

Run: `pnpm typecheck && cd src-tauri && cargo test`
Expected: typecheck PASS; `cargo test` all green (existing 10 + new FTS/writer tests).

- [ ] **Step 4: Manual E2E verification**

Run: `cd src-tauri && cargo tauri dev`

Walk through:
1. Copy a Chinese sentence and an English sentence (Ctrl+C) → they appear in browse mode.
2. Press Alt+Space → window shows, **search box focused**; newest entry is highlighted; AI 命令 strip is visible above the history.
3. **Browse + Quick Paste:** ArrowDown/ArrowUp move highlight; press **Enter** → the highlighted entry is copied to the clipboard and the palette closes; paste elsewhere to confirm.
4. **Browse + open detail:** **Shift+Enter** (or click a row) → detail view opens; **复制** button copies; ← 返回 returns to browse.
5. **Search mode:** type a Chinese substring (e.g. `查询`) → matched history group narrows; type `he` (2 ASCII bytes) → LIKE fallback still matches.
6. **AI command from search:** type `总结` → AI 命令 group narrows to 总结; **Enter** → target entry's detail opens and the summarize action runs (privacy dialog on first use).
7. **AI command from browse:** click the 🤖 总结 chip → runs on the highlighted entry.
8. **Esc** clears query (back to browse); **Esc again** hides the window.
9. Alt+Space again → reopens focused, browse mode restored.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json packages/ui/src/App.tsx
git commit -m "feat: always-on-top launcher window + detail copy"
```

---

### Task 19.7: Version bump to 0.1.1 + full verification

**Goal:** Align version metadata across the workspace and run the complete release gate. (Creating/publishing the actual v0.1.1 GitHub Release stays a separate, user-confirmed step — same as v0.1.0.)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `packages/types/package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/ui/package.json`

**Interfaces:** none.

- [ ] **Step 1: Bump versions to 0.1.1**

- `src-tauri/Cargo.toml`: `version = "0.1.0"` → `version = "0.1.1"`
- `src-tauri/tauri.conf.json`: `"version": "0.1.0"` → `"version": "0.1.1"`
- `packages/types/package.json`, `packages/core/package.json`, `packages/ui/package.json`: `"version": "0.1.0"` → `"version": "0.1.1"`

- [ ] **Step 2: Run the full release gate**

Run: `pnpm install && pnpm typecheck && cd src-tauri && cargo test && cargo build`
Expected: install clean, typecheck PASS, cargo test all green, `cargo build` completes.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json packages/types/package.json packages/core/package.json packages/ui/package.json
git commit -m "chore: bump version to v0.1.1"
```

Note for the human: after this lands on `main`, tag `v0.1.1` + push to trigger the Release workflow (same flow as v0.1.0). Remember the earlier lesson: when PATCH-ing the release via API, always pass `tag_name` explicitly to keep the tag association.

---

## Self-Review (rev 2)

### 1. Spec Coverage

| Review item | Covered By | Status |
|---|---|---|
| Keep HistoryList, don't delete; palette = search entry, HistoryView = browse entry | File Structure Map + Task 19.5 (browse mode renders `HistoryList`, no files deleted) | ✅ |
| CommandPalette as AI Productivity Launcher, not a plain search box | Goal + Design Decisions + Interaction Spec + Task 19.5 (placeholder, AI command strip in browse, fuzzy group in search) | ✅ |
| Quick Paste flow (Enter → set clipboard → close) | Design Decisions + Task 19.2 (`set_clipboard`) + Task 19.5 (`onQuickPaste` → `setClipboard` + `hide()`) | ✅ |
| AI Action integration (summarize/translate/polish/reply/explain from palette) | Task 19.3 (`PALETTE_COMMANDS`) + Task 19.5 (`onRunCommand` → navigate detail + run) | ✅ |
| FTS5 stays MVP (Chinese + English + recency sort; no complex ranking / behavior learning) | Task 19.1 (no bm25, no prefix boost, `ORDER BY created_at DESC`; tests updated) | ✅ |
| Wait for review before coding | No code changed in this review pass | ✅ |

### 2. Placeholder Scan

No "TBD", "TODO", "implement later", or "handle edge cases" remain. Every Rust/TS change ships with full code; every test ships with assertions and exact expected output.

### 3. Type & Signature Consistency

- `search_entries` 4-arg Rust signature is consistent between `storage/entries.rs`, `commands/storage.rs`, and the TS `searchEntries(query, limit?, offset?, contentType?)` wrapper.
- `set_clipboard` ↔ `setClipboard` ↔ `write_clipboard_text` naming is consistent across Rust command, TS wrapper, and crate fn.
- `composePaletteResults(query, entries, commands)` returns `{ commands, entries, topEntry }`, consumed identically in `CommandPalette.tsx`.
- `PALETTE_COMMANDS` actionIds (`text.summarize` … `text.explain`) exactly match the `ActionId` union in `types/actions.ts` and the runners in `App.tsx` (`runSummarize` → `text.summarize`, `runRewrite` → `text.polish`, …).
- `PaletteCommand` / `PaletteItem` / `PaletteComposeResult` defined in `types/palette.ts` and used by `core` and `ui` with matching field names.
- Browse mode selection: store `selectedId` is the single source of truth for highlight + Quick Paste/AI target; `HistoryList` reads it (fixing the v0.1.0 highlight bug where store `selectedId` was never set).

### 4. Known Risks / Follow-ups

- **FTS5 probe** (`test_fts_trigram_available`) is the first gate: if the bundled SQLite lacks trigram, the plan's primary path is invalid — the fix is to ship only the LIKE-fallback path (Task 19.1 still works standalone) and revisit FTS in v0.2.
- **Clipboard round-trip test** touches the real system clipboard; robust locally, possibly flaky in CI. If flaky, exclude via `#[ignore]` — the command itself is unaffected.
- **File-backed entries** (`content_storage = 'file'`) are indexed as empty by FTS. v0.1.1 stores everything inline, so this is theoretical; noted as future work.
- **alwaysOnTop** is a UX preference — easy to remove if it annoys during the manual pass.
- **Browse-mode AI strip is click-only** (keyboard users type to search, then use the fuzzy command group). If desired later, number-key (1–5) shortcuts for the strip are a trivial follow-up.
