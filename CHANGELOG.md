# Changelog

All notable changes to AI Context Clipboard are documented in this file.

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
