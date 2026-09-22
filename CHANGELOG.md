# Changelog

All notable changes to AI Context Clipboard are documented in this file.

## [Unreleased]

### Fixes

- **Registering `Alt+Space` no longer crashes the app.** `register_alt_space`
  used `.expect()`, so if the binding was already taken — PowerToys Run uses
  `Alt+Space` by default, and Windows itself opens the window menu with it —
  `RegisterHotKey` failed and the process panicked during setup. Because the
  window is configured `"visible": false` and there is no tray yet, the user saw
  nothing at all: the app simply failed to launch. The function now returns a
  `Result`, and `run()` logs the reason and shows the window so the app stays
  reachable instead of leaving a headless process behind.

  Note: this is a graceful degradation, not a fix for the underlying limitation.
  The shortcut is still hard-coded and not configurable from the UI.

## [0.3.0] - 2026-09-19

### Features

- **Content-type detection** — every copied snippet is now classified on save
  (`link` / `code` / `json` / `email` / `text`), with a finer `subtype` (language
  name, `path`, `color`, `sensitive`). Detection runs entirely locally via
  heuristics — no network call, no model. The result drives the icons, the type
  filter, and the sensitive-content guard.
- **Sensitive-content guard** — snippets that look like credentials (private
  keys, `password=`/`token=`/`api_key=` assignments, `sk-` / `ghp_` / `AKIA`
  prefixes, JWTs, `mysql://` / `postgres://` connection strings, `Bearer` tokens)
  are flagged `sensitive`. Enable `privacy.skip_sensitive` in settings to stop
  them being written to the history at all.
- **Pin / favourite** — pin any entry to keep it at the top of both the history
  list and the palette. Pinned entries sort first (`is_pinned DESC, created_at
  DESC`) in every query, including full-text search. Optimistic UI with rollback
  on failure.
- **Full-history search** — the command palette now queries the SQLite **FTS5
  trigram** index instead of only the ~50 entries held in memory, so search
  covers the entire stored history. Results are re-ranked locally so relevance
  ordering is preserved, and the palette degrades to a local scan if the backend
  call fails.
- **Type filter** — filter chips in both the palette and the history list
  (全部 / 链接 / 代码 / JSON / 邮箱 / 文本). Filtering is applied server-side
  when searching, so it works across the whole history rather than the loaded
  window.

### Fixes

- **`content_type` was always `'text'`** — `useClipboard` hardcoded the column,
  which made the entire type/subtype system, the icon maps, and the DB index
  dead code. Now driven by real detection.
- **`searchEntries` was never called** — the FTS5 index existed and was
  maintained, but no UI path used it; search silently only covered the loaded
  entries. The palette now routes through it.
- **Positional row mapping broke after migration** — `is_pinned` added via
  `ALTER TABLE` lands *after* `updated_at`, whereas a freshly created table
  places it before `created_at`. Queries now use an explicit `ENTRY_COLUMNS`
  list instead of `SELECT *`, so old and new databases both map correctly
  (covered by `test_migration_on_legacy_database_without_is_pinned`).
- **`toggle_pin` on an unknown id** raised `QueryReturnedNoRows`; now returns
  `false` so a stale UI row cannot crash the caller.

### Tooling

- **`scripts/run-tests.mjs`** — auto-discovers `packages/*/__tests__/*.test.ts`,
  runs each in its own process, and aggregates the totals. `pnpm test` no longer
  depends on a hand-maintained file list that silently skipped new suites.
  A file that exits 0 without printing a `Results:` summary is now treated as a
  failure, so a suite that silently does nothing can no longer inflate the count.
- **CI now runs the test suite**, not just `typecheck`.

### Fixed — test integrity

- **94 assertions could not fail.** `action-engine.test.ts`,
  `ai-client.test.ts` and `privacy-flow.test.ts` asserted with
  `console.assert(...)`, which only logs on failure and returns normally — so the
  test function completed and was counted as passed no matter what. Every call
  now goes through a throwing `assert` helper. Verified by injecting a
  deliberately false assertion into each suite and confirming it turns red
  (`1 failed`, exit code 1) where it previously reported green.
- **`event-bus.test.ts` could not fail either.** It used `console.assert`
  throughout and then unconditionally printed `✅ all tests passed`. Rewritten
  with real assertions covering delivery, unsubscribe, handler isolation,
  `clear()`, `Set` dedupe and the `globalEventBus` singleton — 1 fake test
  replaced by 16 real ones.
- **CI workflow file was invalid.** `run: cargo test --lib storage::` is fine in
  a shell but not in YAML: the trailing `::` in a plain scalar is parsed as a
  mapping key indicator, so GitHub rejected the entire workflow. The symptom was
  subtle — the run appeared with the file path as its name and produced zero
  jobs. The value is now quoted, and all workflow files are validated as part of
  the fix.

### Docs

- **README rewritten** for discoverability: banner, badge row, feature and
  comparison tables, keyboard reference, architecture diagram, and a
  contribution section. Adds `docs/assets/banner.svg` and
  `docs/assets/workflow.svg`.

## [0.2.0] - 2026-09-17

### Features

- **Settings panel** — a real ⚙ settings surface, replacing the previously
  documented-but-missing entry point. Configure the AI provider via presets
  (DeepSeek / OpenAI / 通义千问 / Kimi / custom), toggle the privacy prompt,
  view the stored entry count, and clear history.
- **Clear history** — soft-delete every entry and purge the search index in one
  transaction (`clear_history`).
- **History cap enforcement** — `ui.max_history` is now actually enforced, on
  startup and after each save. Previously the setting was written to the DB but
  never read.
- **Maintenance commands** — `purge_deleted` (hard-delete soft-deleted rows plus
  a best-effort `VACUUM`) and `latest_entry` (most recent live entry).

### Fixes

- **Detail view showed only the preview** — the detail pane rendered the
  200-character `content_preview` instead of the full `content`, so longer
  entries were silently truncated.
- **`content` / `content_preview` null-safety** — both are nullable in the Rust
  layer (`Option<String>`) but were typed as required `string` in TypeScript.
  The palette hint did `content_preview.slice(0, 20)`, which threw a `TypeError`
  on a null preview. Both fields are now `string | null`, and every render path
  goes through `entryPreview()` / `entryPreviewShort()` helpers with tests.

### Docs

- **`docs/BUILD-WINDOWS.md`** — documents the Git Bash `link.exe` shadowing
  issue that breaks `cargo build`/`cargo test` on this machine, plus the
  clipboard-test hang and stale build-lock workarounds.

## [0.1.1] - 2026-08-02

### Features

- **Command Palette launcher** — press Alt+Space for a keyboard-first launcher over clipboard history and AI commands.
- **Clipboard history fuzzy search** — type to filter clipboard history by relevance (Chinese and English).
- **AI command launcher** — run 总结 / 翻译 / 润色 / 回复 / 解释 directly from the palette.
- **Quick Paste** — press Enter on a history entry to copy it to the clipboard and close the palette.
- **Keyboard navigation** — move with ↑/↓, activate with Enter, open details with Shift+Enter, dismiss with Esc.
- **Always-on-top launcher window** — the palette floats above other windows while open.

### Improvements

- **FTS5 local search backend** — SQLite FTS5 index provides fast substring search of clipboard history.
- **Better clipboard handling** — entries can be written back to the system clipboard.
- **IME protection** — Chinese input-method composition no longer triggers palette actions mid-typing.
- **Selection state improvements** — predictable selection across browsing and searching.
- **Search UX improvements** — debounced search, stale-response protection, and a clear searching state.

### Privacy

- API keys are stored locally only.
- Clipboard content is not uploaded by default.
- AI actions require explicit user confirmation before content is sent.

### Known limitations

- AI actions require an API key configured by the user.
- Palette search currently matches against the loaded history window.
- Windows only.
