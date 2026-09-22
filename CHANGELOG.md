# Changelog

All notable changes to AI Context Clipboard are documented in this file.

## [0.3.2] - 2026-09-22

### Features

- **开机自启，可选、默认关闭。** 设置面板新增「启动」一节。打开后登录 Windows 就在托盘里
  运行，不弹窗口；关掉之后任务管理器的「启动」标签也不会留下残留。

  实现直接写 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，没有引入 autostart 插件：
  项目本来就是 Windows-only，剪贴板那块已经在调 Win32，为此多一个依赖不划算 —— 安装包体积
  也是这么省下来的。选 `HKCU` 而不是 `HKLM`，是因为前者不需要管理员权限，而且任务管理器的
  「启动」标签里能看到、能关掉；用户在那边关掉之后，程序不该再自作主张加回来。

  两个不显然的地方：

  - 「当前开没开」是**读注册表**，不是读自己的设置表。用户可能已经从任务管理器里把它关了，
    存一个标志位只会和现实对不上。
  - `set_autostart` 返回**改完之后注册表报告的状态**，而不是把请求值回显回去。写不进去
    （键被锁，或组策略禁止 `Run` 项）时界面会显示失败，而不是给一个看起来成功、实际没生效的
    开关。

- CI 的 Rust 测试新增 `commands::autostart::` 过滤器。这组用例只覆盖 UTF-16 转换、
  `Run` 键路径和命令行引号处理，不碰注册表，所以在无桌面会话的 runner 上是安全的。

## [0.3.1] - 2026-09-22

Everything below comes from a pass over the app asking "what does this actually
feel like to use", rather than from a feature list. Ten of the eleven items were
previously documented as known issues in the README; they are now fixed.

### Features

- **Tray icon** — the app finally has a presence outside its window: left click
  toggles the panel, right click opens a menu with 显示/隐藏面板, 设置… and 退出.
  Closing the window now *hides* it instead of quitting, so the clipboard watcher
  keeps running; 退出 in the tray menu is the explicit way out. Previously there
  was no tray at all (`tray-icon` was enabled in `Cargo.toml` but never wired
  up), so a hidden-start app was invisible and unquittable without Task Manager.
- **Configurable shortcut** — the panel toggle is no longer hard-coded to
  `Alt+Space`. The settings panel records a new combination and applies it live.
  A combination that is already owned by another program is reported and the
  previous binding is restored, both in the database and at runtime, so a failed
  rebind can never leave the app with no shortcut.
- **Delete a single entry** — the history list and the detail view both have a
  delete button (armed on first click, disarmed after 3s, so a stray click cannot
  remove a record). `delete_entry` and `deleteEntry()` already existed but had no
  caller anywhere in the project; the only way to remove one record was to wipe
  the entire history.
- **Copy an AI result** — one click writes the result back to the system
  clipboard. Until now the only way was to select the text by hand.
- **Cancel an in-flight AI request** — a 取消 button appears while the request is
  running, and every request now has a 60-second timeout. Previously a stalled
  request left the panel on 思考中... forever with every AI button disabled, and
  the only recovery was to restart the app.
- **Oversized clipboard content is capped** — anything longer than 200,000
  characters is truncated before it reaches SQLite (and the FTS index), with a
  notice explaining what happened. The recorded `content_size` keeps the
  *original* length. Copying a whole log file used to put tens of megabytes into
  the database in one go.
- **Source app is recorded** — `source_app` and `source_window` are populated
  from the foreground process and window title, so the line under each entry
  shows where the copy came from instead of always being blank.

### Fixes

- **`Alt+Space` no longer crashes the app** (originally reported in 0.3.0's
  `[Unreleased]`). `register_alt_space` used `.expect()`, so a taken binding made
  `RegisterHotKey` fail and the process panic during setup. Combined with a
  hidden window and no tray, the user saw nothing at all. It now returns a
  `Result`, logs the reason, and falls back — and with the tray in place the app
  is reachable even when no shortcut can be registered.
- **Clipboard captures are event-driven, not polled.** A message-only window
  registered with `AddClipboardFormatListener` now receives `WM_CLIPBOARDUPDATE`,
  so nothing is polled and two copies inside the old 300 ms window can no longer
  collapse into one. The read is retried briefly after the event, because the app
  that just handled Ctrl+C usually still owns the clipboard. If the listener
  cannot be created the watcher silently falls back to the old polling loop.
- **Skipped sensitive content is announced.** With 「跳过疑似敏感内容」 on, a
  matching copy used to be dropped in total silence, which reads as the app being
  broken. A notice now says what happened — and the setting finally has a UI
  toggle; previously it was read from the database but there was no way to turn
  it on.
- **Clearing the API key now takes effect.** `useAI` assigned a new `AIClient`
  only when a key was present, so clearing the key left the old client in place
  and requests kept going out with the previous key instead of reporting "请先在
  设置中配置 API Key".
- **An already-cancelled `AbortSignal` is honoured.** `addEventListener` never
  replays an abort that happened before the listener was attached, so the client
  now checks `signal.aborted` explicitly.
- **Clipboard text is no longer assumed to be valid UTF-16.** The old reader
  walked the buffer until it found a NUL with no length bound; it is now bounded
  and reuses the same truncation path.

### Tooling

- **Rust test suite grew from 37 to 54**, and CI now runs three headless-safe
  modules instead of one: `storage::`, `clipboard::watcher::` and `shortcut::`.
  (`clipboard::writer` drives the real Windows clipboard and is excluded from CI;
  it still runs in the release workflow.)
- **TypeScript suite grew from 161 to 178**, adding coverage for the shortcut
  spec builder (including the AZERTY `code`-vs-`key` case and the refusal to bind
  `Escape`) and for AI request timeout/cancellation.
- `useClipboard` imports `@tauri-apps/api/window` statically again; the dynamic
  import was both unnecessary and a Vite warning.

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
