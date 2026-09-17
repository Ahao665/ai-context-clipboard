# Changelog

All notable changes to AI Context Clipboard are documented in this file.

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
