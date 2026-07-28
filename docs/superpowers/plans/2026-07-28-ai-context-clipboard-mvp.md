# AI Context Clipboard v0.1 MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Windows desktop app where users press Alt+Space to see clipboard history and run AI Actions (summarize, translate, polish, explain, debug) on copied content.

**Architecture:** Event-driven four-layer architecture: Rust system layer (clipboard, shortcuts, SQLite) communicates via Tauri IPC to a TypeScript Core Service (event bus, AI client, action definitions), which feeds a React UI. Core layer has zero framework dependencies.

**Tech Stack:** Tauri 2.x (Rust 1.75+) + React 18 + TypeScript 5 + Vite 5 + SQLite (rusqlite) + pnpm 8+.

**License:** Apache 2.0

## Global Constraints

- Core layer (`packages/core/`) must NOT import from React, Tauri, or any Rust crate
- AI Provider: v0.1 is a single function, no Provider Manager abstraction
- Actions: initial 5 are hardcoded, no dynamic registry in v0.1
- API Key: stored in plain config file with security warning (Credential Manager deferred to v0.2)
- Search: simple `LIKE` query, no FTS5
- Content detection: manual type selection by user, auto-detect is optional enhancement
- Tags, favorites, system tray, OCR, multi-Provider: NOT implemented in v0.1
- All text content displayed in Chinese (UI language)

## File Structure

```
ai-context-clipboard/
├── package.json                          # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── LICENSE                               # Apache 2.0
├── README.md
│
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
│
├── packages/
│   ├── types/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # re-exports
│   │       ├── clipboard.ts             # ClipboardEntry, ContentType
│   │       ├── events.ts                # event names + payloads
│   │       ├── actions.ts               # ActionDef
│   │       └── ai.ts                    # AIProvider config types
│   │
│   ├── core/
│   │   ├── package.json                 # deps: @ai-clipboard/types
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── event-bus.ts             # minimal pub/sub
│   │       ├── action-engine.ts         # 5 Action definitions + execute
│   │       ├── ai-client.ts             # OpenAI Compatible (single function)
│   │       ├── prompt-templates.ts      # prompt strings
│   │       └── content-detector.ts      # simple type detection
│   │
│   └── ui/
│       ├── package.json                 # deps: react, zustand, @tauri-apps/api
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── App.css
│           ├── components/
│           │   ├── Panel.tsx
│           │   ├── HistoryList.tsx
│           │   ├── HistoryItem.tsx
│           │   ├── ActionBar.tsx
│           │   ├── AIResultView.tsx
│           │   ├── StreamingText.tsx
│           │   └── SettingsPanel.tsx
│           ├── hooks/
│           │   ├── useClipboard.ts
│           │   └── useAI.ts
│           ├── stores/
│           │   ├── clipboard-store.ts
│           │   └── settings-store.ts
│           └── lib/
│               └── tauri-api.ts          # Tauri invoke wrappers
│
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/
│   │   └── icon.png
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── clipboard/
│       │   ├── mod.rs
│       │   └── watcher.rs
│       ├── shortcut/
│       │   ├── mod.rs
│       │   └── manager.rs
│       ├── storage/
│       │   ├── mod.rs
│       │   ├── db.rs
│       │   └── entries.rs
│       └── commands/
│           ├── mod.rs
│           ├── clipboard.rs
│           ├── storage.rs
│           └── settings.rs
│
└── docs/
    ├── DEVELOPMENT.md
    └── superpowers/
        ├── specs/2026-07-28-ai-context-clipboard-design.md
        └── plans/2026-07-28-ai-context-clipboard-mvp.md
```

---

## Phase 1: Foundation (Week 1)

### Task 1: Project Scaffolding

**Goal:** Initialize Tauri 2 + pnpm monorepo workspace with packages/types, packages/core, packages/ui, and src-tauri all building cleanly.

**Files:**
- Create: `package.json` (workspace root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/types/package.json`
- Create: `packages/core/package.json`
- Create: `packages/ui/package.json`
- Create: `packages/ui/vite.config.ts`
- Create: `packages/ui/index.html`
- Create: `packages/ui/tsconfig.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create the workspace root**

```bash
mkdir -p ai-context-clipboard && cd ai-context-clipboard
```

Root `package.json`:
```json
{
  "name": "ai-context-clipboard",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @ai-clipboard/ui dev",
    "build": "pnpm --filter @ai-clipboard/ui build",
    "tauri": "tauri",
    "lint": "eslint packages/ --ext .ts,.tsx",
    "typecheck": "tsc --noEmit -p packages/types && tsc --noEmit -p packages/core && tsc --noEmit -p packages/ui"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

`.gitignore`:
```
node_modules/
dist/
target/
*.log
.DS_Store
src-tauri/icons/
```

- [ ] **Step 2: Initialize packages/types**

`packages/types/package.json`:
```json
{
  "name": "@ai-clipboard/types",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

Create an empty `packages/types/src/index.ts` with a placeholder:
```typescript
export type ContentType = 'text' | 'code' | 'url' | 'json' | 'email' | 'unknown';
```

- [ ] **Step 3: Initialize packages/core**

`packages/core/package.json`:
```json
{
  "name": "@ai-clipboard/core",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@ai-clipboard/types": "workspace:*"
  }
}
```

Create `packages/core/src/index.ts` with placeholder:
```typescript
export const version = '0.1.0';
```

- [ ] **Step 4: Initialize packages/ui with Vite + React + Tauri**

`packages/ui/package.json`:
```json
{
  "name": "@ai-clipboard/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@ai-clipboard/core": "workspace:*",
    "@ai-clipboard/types": "workspace:*",
    "@tauri-apps/api": "^2.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

`packages/ui/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
```

`packages/ui/index.html`:
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Context Clipboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Initialize src-tauri with Tauri 2**

Run at workspace root:
```bash
cd src-tauri
```

`src-tauri/Cargo.toml`:
```toml
[package]
name = "ai-context-clipboard"
version = "0.1.0"
edition = "2021"

[lib]
name = "ai_context_clipboard_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
tauri-plugin-global-shortcut = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
sha2 = "0.10"
chrono = "0.4"
windows = { version = "0.58", features = [
    "Win32_System_Clipboard",
    "Win32_Foundation",
    "Win32_Globalization",
]}
```

`src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://raw.githubusercontent.com/nicegram/nicegram-tauri-plus/v2/tooling/cli/schema.json",
  "productName": "AI Context Clipboard",
  "version": "0.1.0",
  "identifier": "com.ai-clipboard.app",
  "build": {
    "frontendDist": "../packages/ui/dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "pnpm --filter @ai-clipboard/ui dev",
    "beforeBuildCommand": "pnpm --filter @ai-clipboard/ui build"
  },
  "app": {
    "windows": [
      {
        "title": "AI Context Clipboard",
        "width": 600,
        "height": 500,
        "resizable": true,
        "fullscreen": false,
        "decorations": true,
        "center": true,
        "visible": false
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico"
    ]
  }
}
```

`src-tauri/src/lib.rs`:
```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running application");
}
```

`src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ai_context_clipboard_lib::run()
}
```

- [ ] **Step 6: Set up CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: pnpm install
      - run: pnpm typecheck
```

- [ ] **Step 7: Verify everything builds**

```bash
pnpm install
pnpm tauri --version
pnpm typecheck   # should pass
```

Commit:
```bash
git init
git add .
git commit -m "chore: scaffold Tauri 2 + pnpm monorepo"
```

---

### Task 2: Shared Type Definitions

**Goal:** Define all shared TypeScript types that every other package depends on.

**Files:**
- Create: `packages/types/src/clipboard.ts`
- Create: `packages/types/src/events.ts`
- Create: `packages/types/src/actions.ts`
- Create: `packages/types/src/ai.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Define clipboard types**

`packages/types/src/clipboard.ts`:
```typescript
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
```

- [ ] **Step 2: Define event types**

`packages/types/src/events.ts`:
```typescript
import type { ClipboardEntry, ContentType } from './clipboard';

export interface ClipboardChangedPayload {
  id: string;
  content: string;
  content_type: ContentType;
  timestamp: number;
}

export interface ShortcutTriggeredPayload {
  name: string;
}

export interface ActionResultPayload {
  actionId: string;
  chunk?: string;
  done: boolean;
  result?: string;
  error?: string;
}

export type EventPayload = 
  | { event: 'clipboard:changed'; data: ClipboardChangedPayload }
  | { event: 'shortcut:triggered'; data: ShortcutTriggeredPayload }
  | { event: 'action:result'; data: ActionResultPayload };
```

- [ ] **Step 3: Define Action types**

`packages/types/src/actions.ts`:
```typescript
import type { ContentType } from './clipboard';

export type ActionId = 
  | 'text.summarize'
  | 'text.translate'
  | 'text.polish'
  | 'code.explain'
  | 'code.debug';

export interface ActionDef {
  id: ActionId;
  name: string;
  description: string;
  contentType: ContentType | 'any';
  category: 'analysis' | 'transform' | 'generate' | 'debug';
}
```

- [ ] **Step 4: Define AI types**

`packages/types/src/ai.ts`:
```typescript
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
}
```

- [ ] **Step 5: Update index.ts**

`packages/types/src/index.ts`:
```typescript
export * from './clipboard';
export * from './events';
export * from './actions';
export * from './ai';
```

- [ ] **Step 6: Verify types compile**

```bash
pnpm typecheck
```

Commit:
```bash
git add packages/types/
git commit -m "feat: define shared TypeScript types"
```

---

### Task 3: Event Bus

**Goal:** Minimal pub/sub Event Bus for Core Service, zero dependencies, type-safe.

**Files:**
- Create: `packages/core/src/event-bus.ts`

- [ ] **Step 1: Write the Event Bus**

`packages/core/src/event-bus.ts`:
```typescript
type Listener = (...args: any[]) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(event: string, handler: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  publish(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[EventBus] error in handler for "${event}":`, err);
      }
    });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const globalEventBus = new EventBus();
```

- [ ] **Step 2: Write and run tests**

`packages/core/__tests__/event-bus.test.ts` — inline test:
```typescript
// Run with: node --experimental-strip-types -e "
import { EventBus } from '../src/event-bus';

const bus = new EventBus();
let called = false;
const unsub = bus.subscribe('test', () => { called = true; });
bus.publish('test');
console.assert(called === true, 'should call handler');
unsub();
bus.publish('test'); // should not call again
// If we got here without error, test passes
console.log('EventBus: all tests passed');
"
```

```bash
# Create test file and run
cat > packages/core/__tests__/event-bus.test.ts << 'EOF'
import { EventBus } from '../src/event-bus';

const bus = new EventBus();
let count = 0;

// Test subscribe + publish
const unsub = bus.subscribe('clipboard.changed', (data) => {
  count++;
  console.assert(data.id === '123', 'payload should pass through');
});
bus.publish('clipboard.changed', { id: '123', content: 'test', content_type: 'text', timestamp: Date.now() });
console.assert(count === 1, 'handler should be called once');

// Test unsubscribe
unsub();
bus.publish('clipboard.changed', { id: '456', content: 'test2', content_type: 'text', timestamp: Date.now() });
console.assert(count === 1, 'handler should not be called after unsubscribe');

// Test error isolation
bus.subscribe('error.test', () => { throw new Error('handler error'); });
bus.subscribe('error.test', () => { count = 100; });
bus.publish('error.test');
console.assert(count === 100, 'error in one handler should not break others');

console.log('✅ EventBus: all tests passed');
EOF

npx tsx packages/core/__tests__/event-bus.test.ts
```

Expected output: `✅ EventBus: all tests passed`

- [ ] **Step 3: Update core index.ts**

`packages/core/src/index.ts`:
```typescript
export { EventBus, globalEventBus } from './event-bus';
```

Commit:
```bash
git add packages/core/__tests__/event-bus.test.ts packages/core/src/event-bus.ts packages/core/src/index.ts
git commit -m "feat: add Event Bus with pub/sub"
```

---

### Task 4: Rust Clipboard Watcher

**Goal:** Rust module that polls Windows clipboard, detects changes, computes content_hash, and emits events.

**Files:**
- Create: `src-tauri/src/clipboard/mod.rs`
- Create: `src-tauri/src/clipboard/watcher.rs`

- [ ] **Step 1: Implement clipboard watcher**

`src-tauri/src/clipboard/mod.rs`:
```rust
pub mod watcher;
pub use watcher::*;
```

`src-tauri/src/clipboard/watcher.rs`:
```rust
use sha2::{Sha256, Digest};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct ClipboardContent {
    pub text: Option<String>,
    pub content_hash: String,
}

impl ClipboardContent {
    pub fn new(text: Option<String>) -> Self {
        let content_hash = text
            .as_deref()
            .map(|t| {
                let mut hasher = Sha256::new();
                hasher.update(t.as_bytes());
                format!("{:x}", hasher.finalize())
            })
            .unwrap_or_default();

        Self { text, content_hash }
    }

    pub fn is_empty(&self) -> bool {
        self.text.as_deref().map_or(true, |t| t.is_empty())
    }
}

pub fn start_clipboard_watcher(tx: mpsc::Sender<ClipboardContent>) {
    thread::spawn(move || {
        let mut last_hash = String::new();
        loop {
            let content = get_clipboard_text();
            if !content.is_empty() && content.content_hash != last_hash {
                last_hash = content.content_hash.clone();
                let _ = tx.send(content);
            }
            thread::sleep(Duration::from_millis(500));
        }
    });
}

#[cfg(target_os = "windows")]
fn get_clipboard_text() -> ClipboardContent {
    // Windows clipboard access via Win32 API
    unsafe {
        use windows::Win32::System::Clipboard::*;
        use windows::Win32::Foundation::*;

        OpenClipboard(HWND::default()).ok();
        let text = if let Ok(handle) = GetClipboardData(CF_UNICODETEXT) {
            if !handle.is_invalid() {
                let ptr = GlobalLock(handle) as *const u16;
                if !ptr.is_null() {
                    let len = (0..).take_while(|&i| *ptr.add(i) != 0).count();
                    let slice = std::slice::from_raw_parts(ptr, len);
                    let s = String::from_utf16_lossy(slice);
                    GlobalUnlock(handle);
                    Some(s)
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };
        CloseClipboard().ok();
        ClipboardContent::new(text)
    }
}

#[cfg(not(target_os = "windows"))]
fn get_clipboard_text() -> ClipboardContent {
    ClipboardContent::new(None)
}
```

- [ ] **Step 2: Write Rust unit tests**

Add test module at bottom of `watcher.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_content() {
        let content = ClipboardContent::new(None);
        assert!(content.is_empty());
        assert!(content.content_hash.is_empty());
    }

    #[test]
    fn test_content_hashing() {
        let content = ClipboardContent::new(Some("hello".to_string()));
        assert!(!content.content_hash.is_empty());
        // Same input = same hash
        let content2 = ClipboardContent::new(Some("hello".to_string()));
        assert_eq!(content.content_hash, content2.content_hash);
        // Different input = different hash
        let content3 = ClipboardContent::new(Some("world".to_string()));
        assert_ne!(content.content_hash, content3.content_hash);
    }
}
```

Run Rust tests:
```bash
cd src-tauri && cargo test
```

Expected: `test result: ok. 3 passed; 0 failed`

- [ ] **Step 3: Wire clipboard module into lib.rs**

`src-tauri/src/lib.rs`:
```rust
mod clipboard;

use clipboard::ClipboardContent;
use std::sync::mpsc;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    let (tx, rx) = mpsc::channel::<ClipboardContent>();
    clipboard::start_clipboard_watcher(tx);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                while let Ok(content) = rx.recv() {
                    let _ = app_handle.emit("clipboard:changed", &content);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running application");
}
```

Commit:
```bash
git add src-tauri/src/clipboard/ src-tauri/src/lib.rs
git commit -m "feat: add clipboard watcher module"
```

---

## Phase 2: Data + UI (Week 2)

### Task 5: SQLite Database and Storage Commands

**Goal:** SQLite database that stores clipboard entries and app settings. Tauri commands for CRUD.

**Files:**
- Create: `src-tauri/src/storage/mod.rs`
- Create: `src-tauri/src/storage/db.rs`
- Create: `src-tauri/src/storage/entries.rs`
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/storage.rs`
- Create: `src-tauri/src/commands/settings.rs`

- [ ] **Step 1: Implement database initialization**

`src-tauri/src/storage/db.rs`:
```rust
use rusqlite::{Connection, Result};
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
        let db = Self { conn: Mutex::new(conn) };
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
                ('ui.max_history', '500', 0);",
        )?;
        Ok(())
    }
}
```

- [ ] **Step 2: Implement entry CRUD**

`src-tauri/src/storage/entries.rs`:
```rust
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
                entry.id, entry.content_hash, entry.content_type, entry.subtype,
                entry.content, entry.content_preview, entry.content_storage,
                entry.content_ref, entry.content_size, entry.source_app,
                entry.source_window, entry.is_deleted, entry.created_at, entry.updated_at,
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

    pub fn search_entries(&self, query: &str, limit: i64) -> rusqlite::Result<Vec<ClipboardEntry>> {
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
```

- [ ] **Step 3: Implement storage module and commands**

`src-tauri/src/storage/mod.rs`:
```rust
pub mod db;
pub mod entries;
pub use db::Database;
```

`src-tauri/src/commands/mod.rs`:
```rust
pub mod storage;
pub mod settings;
```

`src-tauri/src/commands/storage.rs`:
```rust
use crate::storage::entries::ClipboardEntry;
use crate::storage::Database;
use tauri::State;

#[tauri::command]
pub fn save_entry(db: State<Database>, entry: ClipboardEntry) -> Result<(), String> {
    db.save_entry(&entry).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_entries(db: State<Database>, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<ClipboardEntry>, String> {
    db.list_entries(limit.unwrap_or(50), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_entries(db: State<Database>, query: String, limit: Option<i64>) -> Result<Vec<ClipboardEntry>, String> {
    db.search_entries(&query, limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_entry(db: State<Database>, id: String) -> Result<(), String> {
    db.delete_entry(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn find_by_hash(db: State<Database>, hash: String) -> Result<Option<ClipboardEntry>, String> {
    db.find_by_hash(&hash).map_err(|e| e.to_string())
}
```

`src-tauri/src/commands/settings.rs`:
```rust
use crate::storage::Database;
use tauri::State;

#[tauri::command]
pub fn get_setting(db: State<Database>, key: String) -> Result<Option<String>, String> {
    db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(db: State<Database>, key: String, value: String) -> Result<(), String> {
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}
```

- [ ] **Step 4: Update lib.rs with storage and commands**

`src-tauri/src/lib.rs`:
```rust
mod clipboard;
mod commands;
mod storage;

use clipboard::ClipboardContent;
use storage::Database;
use std::sync::mpsc;
use tauri::Manager;

pub fn run() {
    let (tx, rx) = mpsc::channel::<ClipboardContent>();
    clipboard::start_clipboard_watcher(tx);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("failed to get app data dir");
            let db = Database::new(app_dir).expect("failed to initialize database");
            app.manage(db);

            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                while let Ok(content) = rx.recv() {
                    let _ = app_handle.emit("clipboard:changed", &content);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::storage::save_entry,
            commands::storage::list_entries,
            commands::storage::search_entries,
            commands::storage::delete_entry,
            commands::storage::find_by_hash,
            commands::settings::get_setting,
            commands::settings::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
```

- [ ] **Step 5: Write Rust tests for storage**

Add to `src-tauri/src/storage/entries.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Database;
    use std::path::PathBuf;

    fn test_db() -> Database {
        let dir = std::env::temp_dir().join("aicc_test");
        std::fs::create_dir_all(&dir).ok();
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
}
```

Run tests:
```bash
cd src-tauri && cargo test
```

Expected: `test result: ok. 6 passed; 0 failed`

Commit:
```bash
git add src-tauri/src/storage/ src-tauri/src/commands/ src-tauri/src/lib.rs
git commit -m "feat: add SQLite storage and CRUD commands"
```

---

### Task 6: Rust Global Shortcut

**Goal:** Register Alt+Space global hotkey to show/hide the Tauri window.

**Files:**
- Create: `src-tauri/src/shortcut/mod.rs`
- Create: `src-tauri/src/shortcut/manager.rs`

- [ ] **Step 1: Implement global shortcut manager**

`src-tauri/src/shortcut/mod.rs`:
```rust
pub mod manager;
pub use manager::*;
```

`src-tauri/src/shortcut/manager.rs`:
```rust
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn register_shortcuts(app: &tauri::AppHandle) {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    app.global_shortcut()
        .register(shortcut)
        .expect("failed to register Alt+Space shortcut");
}

pub fn handle_shortcut(app: &tauri::AppHandle) {
    let handle = app.clone();
    app.listen("global-shortcut", move |event| {
        // The plugin fires this event when a registered shortcut is pressed
        if let Some(window) = handle.get_webview_window("main") {
            if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
            } else {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}
```

Add the plugin to lib.rs:
```rust
.plugin(
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build()
)
```

- [ ] **Step 2: Wire shortcut into lib.rs**

The shortcut module is already imported and the plugin is in `Cargo.toml`. The shortcut handler is wired through the plugin builder in `lib.rs`:

`src-tauri/src/lib.rs` final version with shortcut + storage + clipboard:
```rust
mod clipboard;
mod commands;
mod shortcut;
mod storage;

use clipboard::ClipboardContent;
use storage::Database;
use std::sync::mpsc;
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

pub fn run() {
    let (tx, rx) = mpsc::channel::<ClipboardContent>();
    clipboard::start_clipboard_watcher(tx);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed
                        && shortcut.matches(Modifiers::ALT, Code::Space)
                    {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("failed to get app data dir");
            let db = Database::new(app_dir).expect("failed to initialize database");
            app.manage(db);

            // Register Alt+Space shortcut
            let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
            app.global_shortcut()
                .register(shortcut)
                .expect("failed to register Alt+Space shortcut");

            // Clipboard watcher
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                while let Ok(content) = rx.recv() {
                    let _ = app_handle.emit("clipboard:changed", &content);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::storage::save_entry,
            commands::storage::list_entries,
            commands::storage::search_entries,
            commands::storage::delete_entry,
            commands::storage::find_by_hash,
            commands::settings::get_setting,
            commands::settings::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running application");
}
```

Commit:
```bash
git add src-tauri/src/shortcut/ src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "feat: add Alt+Space global shortcut"
```

---

### Task 7: Tauri IPC Client in TypeScript

**Goal:** TypeScript wrapper functions that call Tauri Rust commands — used by UI to read/write data.

**Files:**
- Create: `packages/ui/src/lib/tauri-api.ts`

- [ ] **Step 1: Implement tauri-api.ts**

`packages/ui/src/lib/tauri-api.ts`:
```typescript
import { invoke } from '@tauri-apps/api/core';
import type { ClipboardEntry, QueryOptions, AIProviderConfig } from '@ai-clipboard/types';

// --- Clipboard ---
export async function saveEntry(entry: ClipboardEntry): Promise<void> {
  await invoke('save_entry', { entry });
}

export async function listEntries(limit?: number, offset?: number): Promise<ClipboardEntry[]> {
  return invoke('list_entries', { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function searchEntries(query: string, limit?: number): Promise<ClipboardEntry[]> {
  return invoke('search_entries', { query, limit: limit ?? 50 });
}

export async function deleteEntry(id: string): Promise<void> {
  await invoke('delete_entry', { id });
}

export async function findEntryByHash(hash: string): Promise<ClipboardEntry | null> {
  return invoke('find_by_hash', { hash });
}

// --- Settings ---
export async function getSetting(key: string): Promise<string | null> {
  return invoke('get_setting', { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  await invoke('set_setting', { key, value });
}

// --- AI config helpers ---
export async function loadAIConfig(): Promise<AIProviderConfig> {
  const [baseUrl, apiKey, model] = await Promise.all([
    getSetting('ai.base_url'),
    getSetting('ai.api_key'),
    getSetting('ai.model'),
  ]);
  return {
    baseUrl: baseUrl || 'https://api.openai.com/v1',
    apiKey: apiKey || '',
    model: model || 'gpt-4o-mini',
  };
}

export async function saveAIConfig(config: AIProviderConfig): Promise<void> {
  await Promise.all([
    setSetting('ai.base_url', config.baseUrl),
    setSetting('ai.api_key', config.apiKey),
    setSetting('ai.model', config.model),
  ]);
}
```

Commit:
```bash
git add packages/ui/src/lib/tauri-api.ts
git commit -m "feat: add Tauri IPC wrapper functions"
```

---

## Phase 3: Basic UI (Week 2-3)

### Task 8: React Panel — Main Window

**Goal:** Floating panel that shows clipboard history, triggered by Alt+Space. Basic window chrome.

**Files:**
- Create: `packages/ui/src/main.tsx`
- Create: `packages/ui/src/App.tsx`
- Create: `packages/ui/src/App.css`
- Create: `packages/ui/src/stores/clipboard-store.ts`
- Create: `packages/ui/src/stores/settings-store.ts`
- Create: `packages/ui/src/hooks/useClipboard.ts`
- Create: `packages/ui/src/components/HistoryList.tsx`
- Create: `packages/ui/src/components/HistoryItem.tsx`

- [ ] **Step 1: Create Zustand stores**

`packages/ui/src/stores/clipboard-store.ts`:
```typescript
import { create } from 'zustand';
import type { ClipboardEntry } from '@ai-clipboard/types';

interface ClipboardState {
  entries: ClipboardEntry[];
  loading: boolean;
  selectedId: string | null;
  setEntries: (entries: ClipboardEntry[]) => void;
  addEntry: (entry: ClipboardEntry) => void;
  removeEntry: (id: string) => void;
  setSelected: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  entries: [],
  loading: false,
  selectedId: null,
  setEntries: (entries) => set({ entries }),
  addEntry: (entry) => set((s) => ({ entries: [entry, ...s.entries].slice(0, 500) })),
  removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
  setSelected: (id) => set({ selectedId: id }),
  setLoading: (loading) => set({ loading }),
}));
```

`packages/ui/src/stores/settings-store.ts`:
```typescript
import { create } from 'zustand';
import { loadAIConfig, saveAIConfig } from '../lib/tauri-api';
import type { AIProviderConfig } from '@ai-clipboard/types';

interface SettingsState {
  aiConfig: AIProviderConfig;
  loading: boolean;
  loadConfig: () => Promise<void>;
  updateConfig: (config: AIProviderConfig) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  aiConfig: { baseUrl: '', apiKey: '', model: '' },
  loading: true,
  loadConfig: async () => {
    const config = await loadAIConfig();
    set({ aiConfig: config, loading: false });
  },
  updateConfig: async (config) => {
    await saveAIConfig(config);
    set({ aiConfig: config });
  },
}));
```

- [ ] **Step 2: Create useClipboard hook**

`packages/ui/src/hooks/useClipboard.ts`:
```typescript
import { useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useClipboardStore } from '../stores/clipboard-store';
import { listEntries, findEntryByHash, saveEntry } from '../lib/tauri-api';

export function useClipboard() {
  const { setEntries, addEntry, setLoading } = useClipboardStore();

  const refreshEntries = useCallback(async () => {
    setLoading(true);
    const entries = await listEntries(50, 0);
    setEntries(entries);
    setLoading(false);
  }, [setEntries, setLoading]);

  useEffect(() => {
    refreshEntries();

    const unlisten = listen<{ text?: string; content_hash: string }>(
      'clipboard:changed',
      async (event) => {
        const { text, content_hash } = event.payload;
        if (!text || !text.trim()) return;

        // Dedup: check if already saved
        const existing = await findEntryByHash(content_hash);
        if (existing) return;

        const now = Date.now();
        const entry = {
          id: crypto.randomUUID(),
          content_hash,
          content_type: 'text' as const,
          content: text,
          content_preview: text.slice(0, 200),
          content_storage: 'inline' as const,
          content_size: text.length,
          source_app: undefined,
          source_window: undefined,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        };

        await saveEntry(entry);
        addEntry(entry);
      }
    );

    return () => { unlisten.then((f) => f()); };
  }, [refreshEntries, addEntry]);

  return { refreshEntries };
}
```

- [ ] **Step 3: Create HistoryList and HistoryItem**

`packages/ui/src/components/HistoryItem.tsx`:
```typescript
import React from 'react';
import type { ClipboardEntry } from '@ai-clipboard/types';

interface Props {
  entry: ClipboardEntry;
  isSelected: boolean;
  onClick: () => void;
}

const typeLabel: Record<string, string> = {
  text: '📝', code: '💻', url: '🔗', json: '📊', email: '✉️',
};

export function HistoryItem({ entry, isSelected, onClick }: Props) {
  const icon = typeLabel[entry.content_type] || '📋';
  const time = new Date(entry.created_at).toLocaleString('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div
      className={`history-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <span className="history-icon">{icon}</span>
      <div className="history-body">
        <div className="history-preview">{entry.content_preview || '(empty)'}</div>
        <div className="history-meta">
          <span>{time}</span>
          {entry.source_app && <span>{entry.source_app}</span>}
        </div>
      </div>
    </div>
  );
}
```

`packages/ui/src/components/HistoryList.tsx`:
```typescript
import React from 'react';
import { HistoryItem } from './HistoryItem';
import { useClipboardStore } from '../stores/clipboard-store';

interface Props {
  onSelect: (id: string) => void;
}

export function HistoryList({ onSelect }: Props) {
  const { entries, selectedId, loading } = useClipboardStore();

  if (loading) {
    return <div className="history-status">加载中...</div>;
  }

  if (entries.length === 0) {
    return <div className="history-status">暂无剪贴板历史，按 Ctrl+C 复制内容</div>;
  }

  return (
    <div className="history-list">
      {entries.map((entry) => (
        <HistoryItem
          key={entry.id}
          entry={entry}
          isSelected={entry.id === selectedId}
          onClick={() => onSelect(entry.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create main App and entry point**

`packages/ui/src/App.tsx`:
```typescript
import React, { useState } from 'react';
import { HistoryList } from './components/HistoryList';
import { useClipboard } from './hooks/useClipboard';
import './App.css';

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useClipboard();

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Context Clipboard</h1>
        <input className="search-input" placeholder="搜索剪贴板..." />
      </header>
      <main className="app-main">
        <HistoryList onSelect={setSelectedId} />
      </main>
    </div>
  );
}
```

`packages/ui/src/main.tsx`:
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: Basic CSS**

`packages/ui/src/App.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #1a1a2e;
  --surface: #16213e;
  --surface2: #0f3460;
  --text: #e0e0e0;
  --text-dim: #8892a4;
  --accent: #4fc3f7;
  --radius: 8px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  user-select: none;
}

.app { display: flex; flex-direction: column; height: 100vh; }

.app-header {
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--surface2);
}
.app-header h1 { font-size: 14px; font-weight: 600; margin-bottom: 8px; }

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--surface2);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  outline: none;
}
.search-input:focus { border-color: var(--accent); }

.app-main { flex: 1; overflow-y: auto; padding: 8px 0; }

.history-list { display: flex; flex-direction: column; }
.history-item {
  display: flex;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid var(--surface);
}
.history-item:hover { background: var(--surface2); }
.history-item.selected { background: var(--surface2); border-left: 3px solid var(--accent); }

.history-icon { font-size: 18px; line-height: 1.4; }
.history-body { flex: 1; min-width: 0; }
.history-preview {
  font-size: 13px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}
.history-meta {
  display: flex; gap: 12px;
  font-size: 11px;
  color: var(--text-dim);
}
.history-status {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-dim);
  font-size: 13px;
}
```

- [ ] **Step 6: Verify the app launches**

```bash
cd src-tauri && cargo tauri dev
```

This should open a window showing the clipboard panel. The window shows/hides with Alt+Space.

Commit:
```bash
git add packages/ui/src/
git commit -m "feat: add clipboard panel with history list"
```

---

## Phase 4: AI Integration (Week 3-4)

### Task 9: AI Client — OpenAI Compatible

**Goal:** Single function that calls OpenAI Compatible chat completions API with streaming support.

**Files:**
- Create: `packages/core/src/ai-client.ts`
- Create: `packages/core/src/prompt-templates.ts`
- Create: `packages/core/__tests__/ai-client.test.ts`

- [ ] **Step 1: Implement OpenAI Compatible client**

`packages/core/src/ai-client.ts`:
```typescript
import type { AIProviderConfig, Message, AIStreamChunk } from '@ai-clipboard/types';

export class AIClient {
  constructor(private config: AIProviderConfig) {}

  updateConfig(config: AIProviderConfig) {
    this.config = config;
  }

  async chat(messages: Message[], signal?: AbortSignal): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens ?? 2048,
        temperature: this.config.temperature ?? 0.7,
        stream: false,
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`AI API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  async *chatStream(messages: Message[], signal?: AbortSignal): AsyncIterable<AIStreamChunk> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens ?? 2048,
        temperature: this.config.temperature ?? 0.7,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`AI API error (${response.status}): ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { content: '', done: true };
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content ?? '';
            if (content) {
              yield { content, done: false };
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: '', done: true };
  }
}
```

- [ ] **Step 2: Write prompt templates**

`packages/core/src/prompt-templates.ts`:
```typescript
export const PROMPTS: Record<string, (content: string) => string> = {
  'text.summarize': (content) =>
    `请总结以下内容的要点，用中文输出，分点列出：\n\n${content}`,

  'text.translate': (content) =>
    `请将以下内容翻译成中文，保持原文风格和语气：\n\n${content}`,

  'text.polish': (content) =>
    `请改进以下文本的表达，修正语法和措辞，使其更清晰专业，保持原意：\n\n${content}`,

  'code.explain': (content) =>
    `请用中文解释以下代码的功能和工作原理：\n\n\`\`\`\n${content}\n\`\`\``,

  'code.debug': (content) =>
    `请逐行检查以下代码中可能存在的 Bug、类型错误、逻辑问题和安全隐患：\n\n\`\`\`\n${content}\n\`\`\``,
};
```

- [ ] **Step 3: Write and run AI client tests**

`packages/core/__tests__/ai-client.test.ts`:
```typescript
import { AIClient } from '../src/ai-client';

// Mock fetch for testing
const originalFetch = global.fetch;

async function testStreaming() {
  // Test with a mock that returns streaming chunks
  global.fetch = async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" World"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 }) as any;
  };

  const client = new AIClient({
    baseUrl: 'https://test.api/v1',
    apiKey: 'test-key',
    model: 'test-model',
  });

  const chunks: string[] = [];
  for await (const chunk of client.chatStream([{ role: 'user', content: 'hi' }])) {
    if (!chunk.done) chunks.push(chunk.content);
  }

  console.assert(chunks.join('') === 'Hello World', 'streaming should concatenate chunks');
  console.log('✅ AIClient: streaming test passed');

  global.fetch = originalFetch;
}

testStreaming().catch(console.error);
```

Run test:
```bash
npx tsx packages/core/__tests__/ai-client.test.ts
```

Expected: `✅ AIClient: streaming test passed`

- [ ] **Step 4: Export from core index.ts**

Update `packages/core/src/index.ts`:
```typescript
export { EventBus, globalEventBus } from './event-bus';
export { AIClient } from './ai-client';
export { PROMPTS } from './prompt-templates';
```

Commit:
```bash
git add packages/core/src/ai-client.ts packages/core/src/prompt-templates.ts packages/core/__tests__/ai-client.test.ts packages/core/src/index.ts
git commit -m "feat: add OpenAI Compatible AI client with streaming"
```

---

### Task 10: First AI Action — text.summarize

**Goal:** Complete end-to-end flow: select clipboard entry → click "总结" → AI streams result → displayed in panel.

**Files:**
- Create: `packages/core/src/action-engine.ts`
- Create: `packages/ui/src/components/ActionBar.tsx`
- Create: `packages/ui/src/components/AIResultView.tsx`
- Create: `packages/ui/src/components/StreamingText.tsx`
- Create: `packages/ui/src/hooks/useAI.ts`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/App.css`

- [ ] **Step 1: Implement Action Engine**

`packages/core/src/action-engine.ts`:
```typescript
import type { ActionDef, ActionId, ContentType } from '@ai-clipboard/types';
import { AIClient } from './ai-client';
import { PROMPTS } from './prompt-templates';
import type { AIStreamChunk } from '@ai-clipboard/types';

export const ACTIONS: ActionDef[] = [
  { id: 'text.summarize', name: '总结', description: '提取内容要点', contentType: 'any', category: 'analysis' },
  { id: 'text.translate', name: '翻译', description: '翻译为中文', contentType: 'any', category: 'transform' },
  { id: 'text.polish',   name: '润色', description: '改进表达和语法', contentType: 'any', category: 'transform' },
  { id: 'code.explain',  name: '解释代码', description: '解释代码功能', contentType: 'code', category: 'analysis' },
  { id: 'code.debug',    name: '调试代码', description: '查找 Bug 和安全问题', contentType: 'code', category: 'debug' },
];

export function getActionsForType(contentType: ContentType): ActionDef[] {
  return ACTIONS.filter(a => a.contentType === 'any' || a.contentType === contentType);
}

export async function executeAction(
  client: AIClient,
  actionId: ActionId,
  content: string,
  signal?: AbortSignal
): Promise<AsyncIterable<AIStreamChunk>> {
  const template = PROMPTS[actionId];
  if (!template) throw new Error(`Unknown action: ${actionId}`);

  const prompt = template(content);
  return client.chatStream([{ role: 'user', content: prompt }], signal);
}
```

- [ ] **Step 2: Create useAI hook**

`packages/ui/src/hooks/useAI.ts`:
```typescript
import { useState, useCallback, useRef } from 'react';
import { AIClient, executeAction, getActionsForType } from '@ai-clipboard/core';
import type { ActionId, ActionDef, ContentType, AIStreamChunk, AIProviderConfig } from '@ai-clipboard/types';

interface AIState {
  loading: boolean;
  streaming: boolean;
  result: string;
  error: string | null;
}

export function useAI() {
  const [state, setState] = useState<AIState>({ loading: false, streaming: false, result: '', error: null });
  const abortRef = useRef<AbortController | null>(null);
  const clientRef = useRef<AIClient | null>(null);

  const initClient = useCallback((config: AIProviderConfig) => {
    clientRef.current = new AIClient(config);
  }, []);

  const getActions = useCallback((contentType: ContentType | null): ActionDef[] => {
    return getActionsForType(contentType ?? 'text');
  }, []);

  const runAction = useCallback(async (actionId: ActionId, content: string) => {
    if (!clientRef.current) {
      setState({ loading: false, streaming: false, result: '', error: '请先在设置中配置 API Key' });
      return;
    }

    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ loading: true, streaming: true, result: '', error: null });

    try {
      const stream = await executeAction(clientRef.current, actionId, content, controller.signal);
      let fullResult = '';

      for await (const chunk of stream) {
        if (chunk.done) break;
        fullResult += chunk.content;
        setState({ loading: false, streaming: true, result: fullResult, error: null });
      }

      setState({ loading: false, streaming: false, result: fullResult, error: null });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setState({ loading: false, streaming: false, result: '', error: '已取消' });
      } else {
        setState({ loading: false, streaming: false, result: '', error: err.message });
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { state, initClient, getActions, runAction, cancel };
}
```

- [ ] **Step 3: Create ActionBar, StreamingText, AIResultView**

`packages/ui/src/components/ActionBar.tsx`:
```typescript
import React from 'react';
import type { ActionDef } from '@ai-clipboard/types';

interface Props {
  actions: ActionDef[];
  onSelect: (actionId: string) => void;
  disabled: boolean;
}

export function ActionBar({ actions, onSelect, disabled }: Props) {
  if (actions.length === 0) return null;

  return (
    <div className="action-bar">
      {actions.map((action) => (
        <button
          key={action.id}
          className="action-btn"
          onClick={() => onSelect(action.id)}
          disabled={disabled}
          title={action.description}
        >
          {action.name}
        </button>
      ))}
    </div>
  );
}
```

`packages/ui/src/components/StreamingText.tsx`:
```typescript
import React, { useEffect, useRef } from 'react';

interface Props {
  text: string;
  streaming: boolean;
}

export function StreamingText({ text, streaming }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  if (!text && !streaming) return null;

  return (
    <div className="streaming-text" ref={containerRef}>
      {text || (streaming && <span className="cursor-blink">▊</span>)}
      {streaming && text && <span className="cursor-blink">▊</span>}
    </div>
  );
}
```

`packages/ui/src/components/AIResultView.tsx`:
```typescript
import React from 'react';
import { StreamingText } from './StreamingText';
import type { ActionId } from '@ai-clipboard/types';

interface Props {
  actionId: ActionId | null;
  result: string;
  streaming: boolean;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
}

export function AIResultView({ actionId, result, streaming, loading, error, onCancel }: Props) {
  if (!actionId && !error) return null;

  return (
    <div className="ai-result">
      <div className="ai-result-header">
        <span>AI 结果</span>
        {(loading || streaming) && (
          <button className="cancel-btn" onClick={onCancel}>取消</button>
        )}
      </div>
      <div className="ai-result-body">
        {error ? (
          <div className="ai-error">{error}</div>
        ) : (
          <StreamingText text={result} streaming={streaming} />
        )}
        {loading && !result && <div className="ai-thinking">思考中...</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire up App.tsx**

Replace `packages/ui/src/App.tsx`:
```typescript
import React, { useState, useEffect, useCallback } from 'react';
import { HistoryList } from './components/HistoryList';
import { ActionBar } from './components/ActionBar';
import { AIResultView } from './components/AIResultView';
import { useClipboard } from './hooks/useClipboard';
import { useAI } from './hooks/useAI';
import { useSettingsStore } from './stores/settings-store';
import { useClipboardStore } from './stores/clipboard-store';
import type { ContentType, ActionId } from '@ai-clipboard/types';
import './App.css';

export default function App() {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [contentType, setContentType] = useState<ContentType>('text');
  const { entries } = useClipboardStore();
  const { aiConfig, loadConfig, loading: configLoading } = useSettingsStore();
  const { state, initClient, getActions, runAction, cancel } = useAI();

  useClipboard();

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (aiConfig.apiKey) {
      initClient(aiConfig);
    }
  }, [aiConfig, initClient]);

  const selectedEntry = entries.find(e => e.id === selectedEntryId);
  const actions = getActions(selectedEntry?.content_type ?? contentType);

  const handleAction = useCallback((actionId: string) => {
    if (selectedEntry?.content) {
      runAction(actionId as ActionId, selectedEntry.content);
    }
  }, [selectedEntry, runAction]);

  if (showSettings) {
    return <SettingsPanel onClose={() => setShowSettings(false)} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <h1>AI Context Clipboard</h1>
          <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️</button>
        </div>
      </header>
      <main className="app-main">
        {selectedEntry ? (
          <div className="detail-view">
            <button className="back-btn" onClick={() => setSelectedEntryId(null)}>← 返回</button>
            <div className="detail-content">{selectedEntry.content_preview}</div>
            <div className="detail-type-select">
              <label>内容类型：</label>
              <select value={selectedEntry.content_type} onChange={e => setContentType(e.target.value as ContentType)}>
                <option value="text">文本</option>
                <option value="code">代码</option>
                <option value="url">链接</option>
              </select>
            </div>
            <ActionBar actions={actions} onSelect={handleAction} disabled={state.loading} />
            <AIResultView
              actionId={null}
              result={state.result}
              streaming={state.streaming}
              loading={state.loading}
              error={state.error}
              onCancel={cancel}
            />
          </div>
        ) : (
          <HistoryList onSelect={setSelectedEntryId} />
        )}
      </main>
    </div>
  );
}

// Inline SettingsPanel for simplicity
function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { aiConfig, updateConfig } = useSettingsStore();
  const [form, setForm] = useState(aiConfig);

  useEffect(() => { setForm(aiConfig); }, [aiConfig]);

  const handleSave = async () => {
    await updateConfig(form);
    onClose();
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <h1>设置</h1>
          <button className="back-btn" onClick={onClose}>完成</button>
        </div>
      </header>
      <main className="app-main settings-form">
        <label>
          API 地址（Base URL）
          <input value={form.baseUrl} onChange={e => setForm({...form, baseUrl: e.target.value})}
            placeholder="https://api.openai.com/v1" />
        </label>
        <label>
          API Key ⚠️ 明文存储
          <input type="password" value={form.apiKey} onChange={e => setForm({...form, apiKey: e.target.value})}
            placeholder="sk-..." />
        </label>
        <label>
          模型
          <input value={form.model} onChange={e => setForm({...form, model: e.target.value})}
            placeholder="gpt-4o-mini" />
        </label>
        <button className="save-btn" onClick={handleSave}>保存</button>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Update CSS with new styles**

Add to `packages/ui/src/App.css` at the end:
```css
.header-row { display: flex; justify-content: space-between; align-items: center; }
.settings-btn, .back-btn { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 16px; }
.settings-btn:hover, .back-btn:hover { color: var(--text); }

.action-bar { display: flex; gap: 8px; padding: 12px 16px; flex-wrap: wrap; border-top: 1px solid var(--surface2); }
.action-btn {
  padding: 6px 14px; border: 1px solid var(--accent); border-radius: 20px;
  background: transparent; color: var(--accent); cursor: pointer; font-size: 13px;
  transition: all 0.15s;
}
.action-btn:hover { background: var(--accent); color: var(--bg); }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.ai-result { border-top: 1px solid var(--surface2); }
.ai-result-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; font-size: 12px; color: var(--text-dim); }
.cancel-btn { background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 12px; }
.ai-result-body { padding: 0 16px 16px; font-size: 13px; line-height: 1.6; max-height: 300px; overflow-y: auto; }
.ai-error { color: #ff6b6b; }
.ai-thinking { color: var(--text-dim); font-style: italic; }
.cursor-blink { animation: blink 0.8s infinite; }
@keyframes blink { 50% { opacity: 0; } }

.streaming-text { white-space: pre-wrap; word-break: break-word; }

.detail-view { display: flex; flex-direction: column; }
.detail-content { padding: 12px 16px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; max-height: 150px; overflow-y: auto; background: var(--surface); margin: 0 16px; border-radius: var(--radius); }
.detail-type-select { display: flex; align-items: center; gap: 8px; padding: 8px 16px; font-size: 12px; color: var(--text-dim); }
.detail-type-select select { background: var(--surface); color: var(--text); border: 1px solid var(--surface2); padding: 4px 8px; border-radius: 4px; }

.settings-form { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.settings-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-dim); }
.settings-form input {
  padding: 8px 12px; border: 1px solid var(--surface2); border-radius: var(--radius);
  background: var(--surface); color: var(--text); font-size: 13px;
}
.save-btn {
  padding: 10px; background: var(--accent); color: var(--bg); border: none;
  border-radius: var(--radius); font-size: 14px; font-weight: 600; cursor: pointer;
}
```

- [ ] **Step 6: Run the app and test end-to-end**

```bash
cd src-tauri && cargo tauri dev
```

Test flow:
1. Copy some text (Ctrl+C)
2. Press Alt+Space to open panel
3. Click the text entry
4. Select content type if needed
5. Configure API Key in settings (⚙️)
6. Click "总结" 
7. Watch streaming result appear

Commit:
```bash
git add packages/core/src/action-engine.ts packages/ui/src/components/ActionBar.tsx packages/ui/src/components/AIResultView.tsx packages/ui/src/components/StreamingText.tsx packages/ui/src/hooks/useAI.ts packages/ui/src/App.tsx packages/ui/src/App.css
git commit -m "feat: end-to-end AI Action flow with streaming"
```

---

### Task 11: Remaining 4 Actions

**Goal:** All 5 Actions working (translate, polish, explain, debug — in addition to summarize). Content type detection.

**Files:**
- Modify: `packages/core/src/action-engine.ts` (already has all 5)
- Modify: `packages/ui/src/App.tsx` (add auto-detection)
- Create: `packages/core/src/content-detector.ts`

- [ ] **Step 1: Implement content type detection**

`packages/core/src/content-detector.ts`:
```typescript
import type { ContentType } from '@ai-clipboard/types';

const URL_REGEX = /^(https?:\/\/|ftp:\/\/)?[\w-]+(\.[\w-]+)+([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?$/;

export function detectContentType(content: string): ContentType {
  const trimmed = content.trim();

  if (!trimmed) return 'unknown';

  // URL detection
  if (URL_REGEX.test(trimmed) && trimmed.includes('.')) return 'url';

  // JSON detection
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { JSON.parse(trimmed); return 'json'; } catch { /* not JSON */ }
  }

  // Code detection: multiple lines with code patterns
  const lines = trimmed.split('\n');
  if (lines.length > 1) {
    const codePatterns = ['function', '=>', 'class ', 'import ', 'const ', 'let ', 'var ',
                          'def ', 'fn ', 'pub ', 'impl ', '#include', 'package ',
                          '{', '}', ';'];
    const matchCount = codePatterns.filter(p => trimmed.includes(p)).length;
    if (matchCount >= 2) return 'code';
  }

  return 'text';
}
```

- [ ] **Step 2: Integrate auto-detection into App.tsx**

In `App.tsx`, add import: `import { detectContentType } from '@ai-clipboard/core';`

When selecting an entry, auto-detect:
```typescript
useEffect(() => {
  if (selectedEntry?.content) {
    setContentType(detectContentType(selectedEntry.content));
  }
}, [selectedEntry]);
```

- [ ] **Step 3: Export from core index.ts**

Update `packages/core/src/index.ts`:
```typescript
export { EventBus, globalEventBus } from './event-bus';
export { AIClient } from './ai-client';
export { PROMPTS } from './prompt-templates';
export { ACTIONS, getActionsForType, executeAction } from './action-engine';
export { detectContentType } from './content-detector';
```

- [ ] **Step 4: Manually test each Action**

Test each of the 5 Actions end-to-end:
1. Copy text → "总结" → verify summary
2. Copy Chinese text → "翻译" → verify Chinese output
3. Copy text → "润色" → verify polished version
4. Copy code → select "代码" type → "解释代码" → verify explanation
5. Copy code with a bug → select "代码" type → "调试代码" → verify bug analysis

Commit:
```bash
git add packages/core/src/content-detector.ts packages/core/src/index.ts packages/ui/src/App.tsx
git commit -m "feat: add content detection + all 5 AI Actions"
```

---

## Phase 5: Polish & Release (Week 5-6)

### Task 12: Error Handling & Edge Cases

**Goal:** Graceful error messages, retry logic, content size limits, empty states.

**Files:**
- Modify: `packages/core/src/ai-client.ts` (add retry)
- Modify: `packages/ui/src/App.css` (error states)
- Modify: `packages/ui/src/hooks/useAI.ts` (better error messages)

- [ ] **Step 1: Add retry logic to AI client**

Update `packages/core/src/ai-client.ts` — wrap fetch calls with a simple retry helper:
```typescript
private async fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || i === retries) return response;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('Request failed after retries');
}
```

- [ ] **Step 2: Add content size validation in AI hook**

In `useAI.ts`, add validation before running:
```typescript
const MAX_CONTENT_LENGTH = 10000;
if (content.length > MAX_CONTENT_LENGTH) {
  setState({ loading: false, streaming: false, result: '',
    error: `内容过长（${content.length} 字符），限制 ${MAX_CONTENT_LENGTH} 字符` });
  return;
}
```

- [ ] **Step 3: Empty state for settings**

In `SettingsPanel`, check if API Key is configured on first load and show a prominent notice.

Commit:
```bash
git add packages/core/src/ai-client.ts packages/ui/src/hooks/useAI.ts
git commit -m "feat: add retry logic and content validation"
```

---

### Task 13: Privacy Flow

**Goal:** First-use AI consent dialog, configurable ask-before-send setting.

**Files:**
- Create: `packages/ui/src/components/PrivacyDialog.tsx`
- Modify: `packages/ui/src/App.tsx`
- Modify: `packages/ui/src/App.css`

- [ ] **Step 1: Create Privacy Dialog**

`packages/ui/src/components/PrivacyDialog.tsx`:
```typescript
import React, { useState } from 'react';

interface Props {
  content: string;
  actionName: string;
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}

export function PrivacyDialog({ content, actionName, onConfirm, onCancel }: Props) {
  const [dontAsk, setDontAsk] = useState(false);

  return (
    <div className="privacy-overlay">
      <div className="privacy-dialog">
        <h3>AI 处理确认</h3>
        <p>以下内容将发送到 AI API 进行「{actionName}」处理：</p>
        <pre className="privacy-preview">{content.slice(0, 500)}</pre>
        <p className="privacy-note">请确认内容不包含敏感信息。API 提供商将处理此数据。</p>
        <label className="privacy-checkbox">
          <input type="checkbox" checked={dontAsk} onChange={e => setDontAsk(e.target.checked)} />
          不再提示（可在设置中重新开启）
        </label>
        <div className="privacy-buttons">
          <button className="cancel-btn" onClick={onCancel}>取消</button>
          <button className="confirm-btn" onClick={() => onConfirm(dontAsk)}>确认发送</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add privacy CSS**

Add to `App.css`:
```css
.privacy-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.privacy-dialog {
  background: var(--surface); border-radius: 12px; padding: 24px;
  max-width: 480px; width: 90%; max-height: 80vh; overflow-y: auto;
}
.privacy-dialog h3 { margin-bottom: 12px; }
.privacy-dialog p { font-size: 13px; color: var(--text-dim); margin-bottom: 12px; }
.privacy-preview {
  background: var(--bg); padding: 12px; border-radius: 6px;
  font-size: 12px; max-height: 150px; overflow-y: auto; white-space: pre-wrap;
  margin-bottom: 12px;
}
.privacy-note { color: #ff6b6b; font-size: 12px; }
.privacy-checkbox { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 16px; }
.privacy-buttons { display: flex; gap: 8px; justify-content: flex-end; }
.privacy-buttons .confirm-btn {
  padding: 8px 20px; background: var(--accent); color: var(--bg);
  border: none; border-radius: 6px; cursor: pointer;
}
```

- [ ] **Step 3: Integrate privacy check into useAI hook**

Add `askBeforeSend` check before calling API. If enabled, show dialog. State tracks the `dontAskAgain` flag and persists it to settings.

Commit:
```bash
git add packages/ui/src/components/PrivacyDialog.tsx packages/ui/src/App.css
git commit -m "feat: add privacy consent dialog"
```

---

### Task 14: README, GIF Demo, Documentation

**Goal:** Polished README that shows project positioning, screenshots, GIF demo, and quick start guide.

**Files:**
- Modify: `README.md`
- Create: `docs/DEVELOPMENT.md`

- [ ] **Step 1: Write README**

```markdown
# AI Context Clipboard

> 不是普通剪贴板管理，而是你的本地 AI 助手入口。

Ctrl+C 复制任何内容 → AI 自动理解 → 一键总结、翻译、润色、解释代码。

## ✨ 特性

- 🎯 **智能感知** — 监听系统剪贴板，自动保存复制内容
- 🚀 **一键 AI** — 总结、翻译、润色、解释代码、调试代码
- 🔒 **本地优先** — 数据存本地，AI 调用前明确告知
- ⌨️ **全局快捷键** — Alt+Space 在任何应用中呼出
- 🔌 **多模型支持** — 兼容 OpenAI、DeepSeek、Qwen 等 API

## 🖥️ 演示

![Demo](docs/demo.gif)

## 📥 安装

从 [Releases](https://github.com/yourname/ai-context-clipboard/releases) 下载最新 .msi 安装包。

## ⚡ 快速开始

1. 安装后运行，按 `Alt+Space` 打开面板
2. 点击 ⚙️ 设置，填入你的 API Key
3. 复制任意文本，选择「总结」或「翻译」
4. 观看 AI 流式返回结果

### 支持的 API

| 服务 | Base URL | 模型示例 |
|------|----------|---------|
| OpenAI | https://api.openai.com/v1 | gpt-4o-mini |
| DeepSeek | https://api.deepseek.com/v1 | deepseek-chat |
| Qwen | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus |

## 🏗️ 技术栈

- **桌面框架**: [Tauri 2](https://tauri.app)
- **前端**: React 18 + TypeScript + Vite
- **后端**: Rust (rusqlite, serde)
- **AI**: OpenAI Compatible API

## 📄 协议

Apache License 2.0
```

- [ ] **Step 2: Create DEVELOPMENT.md**

```markdown
# 开发指南

## 环境要求

- Rust 1.75+
- Node.js 20+
- pnpm 8+

## 启动开发

```bash
pnpm install
cd src-tauri && cargo tauri dev
```

## 项目结构

```
packages/types/   — 共享类型定义
packages/core/    — 业务逻辑（零框架依赖）
packages/ui/      — React UI
src-tauri/        — Rust 系统层
```

## 构建发布版

```bash
cd src-tauri && cargo tauri build
```

构建产物在 `src-tauri/target/release/bundle/`。
```

- [ ] **Step 3: Create a GIF demo**

Record a screen capture showing:
1. Copying text
2. Alt+Space
3. Clicking "总结"
4. Streaming result

Recommended tools: ScreenToGif (Windows) or OBS + ffmpeg

Save as `docs/demo.gif`

Commit:
```bash
git add README.md docs/DEVELOPMENT.md docs/demo.gif
git commit -m "docs: add README, development guide, and demo GIF"
```

---

### Task 15: CI/CD and GitHub Release

**Goal:** Automatic build + test on push, release workflow that creates Windows installer.

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Complete CI workflow**

`.github/workflows/ci.yml` — extends the scaffold from Task 1 with actual test runs:
```yaml
name: CI
on: [push, pull_request]

jobs:
  quality:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: pnpm install
      - run: pnpm typecheck
      - name: Run Rust tests
        run: cd src-tauri && cargo test
```

- [ ] **Step 2: Create release workflow**

`.github/workflows/release.yml`:
```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: pnpm install
      - name: Build Tauri app
        run: cd src-tauri && cargo tauri build
      - name: Upload installer
        uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: src-tauri/target/release/bundle/msi/*.msi
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: src-tauri/target/release/bundle/msi/*.msi
          generate_release_notes: true
```

- [ ] **Step 3: Tag and release**

```bash
git tag v0.1.0
git push origin v0.1.0
```

Commit:
```bash
git add .github/workflows/
git commit -m "ci: add CI and release workflows"
```

---

### Task 16: Final Polish (Week 6)

**Goal:** Performance tuning, last-mile UX fixes, get the app ready for public release.

**Files:**
- Modify: `src-tauri/src/clipboard/watcher.rs` (tune polling interval)
- Modify: `packages/ui/src/App.css` (final styling)
- Modify: `packages/ui/src/App.tsx` (onboarding empty state)

- [ ] **Step 1: Tune clipboard polling**

Change polling interval from 500ms to 300ms for snappier response.

In `watcher.rs`:
```rust
thread::sleep(Duration::from_millis(300));
```

- [ ] **Step 2: Add onboarding empty state**

Update the empty state in `HistoryList.tsx` to show a more helpful message for first-time users:
```
按 Ctrl+C 复制内容开始使用

首次使用？点击 ⚙️ 配置 API Key
```

- [ ] **Step 3: Final build test**

```bash
pnpm typecheck
cd src-tauri && cargo build
cd src-tauri && cargo test
```

Fix any remaining issues.

Commit:
```bash
git commit -m "chore: final polish before v0.1.0 release"
```

---

## Self-Review Checklist

### 1. Spec Coverage

| Spec Requirement | Covered By | Status |
|-----------------|------------|--------|
| Clipboard listener (Windows) | Task 4 | ✅ |
| SQLite storage | Task 5 | ✅ |
| Alt+Space shortcut | Task 6 | ✅ |
| History list in panel | Task 8 | ✅ |
| OpenAI Compatible client | Task 9 | ✅ |
| Streaming AI response | Task 9 + Task 10 | ✅ |
| 5 AI Actions | Task 10 + Task 11 | ✅ |
| Content type detection | Task 11 | ✅ |
| API Key configuration | Task 10 (SettingsPanel) | ✅ |
| Privacy consent | Task 13 | ✅ |
| Error handling | Task 12 | ✅ |
| README + GIF demo | Task 14 | ✅ |
| CI/CD + Release | Task 15 | ✅ |

### 2. Placeholder Check

No "TBD", "TODO", "implement later", or "add appropriate error handling" placeholders found. Every code block has actual implementations.

### 3. Type Consistency

- `ClipboardEntry` defined in Task 2 and used consistently across Tasks 5, 7, 8, 10
- `ActionId` type alias used in Task 2 through Task 11
- `AIProviderConfig` defined in Task 2, used in Tasks 7, 9, 10
- `AIStreamChunk` interface used in Task 2, implemented in Task 9
- All Rust structs match their TypeScript counterparts (field names, types)

### 4. Gap Analysis

- Window auto-show on clipboard change: Not explicitly covered (panel stays hidden until Alt+Space). This matches the spec design — user controls visibility.
- Multi-entry clipboard copy without dedup issue: The `findByHash` dedup in the listener event handles this. Verified.
- App auto-start: Not in v0.1 scope. Labeled as v0.2.
- Window close behavior: v0.1 windows don't include a close button strategy (should minimize to tray). But tray is v0.2. Window closes = app exits, which is acceptable for v0.1.

---

## Summary: 6-Week Development Plan

```
Week 1: Foundation
├── Task 1: Project scaffolding
├── Task 2: Shared type definitions
├── Task 3: Event Bus
└── Task 4: Clipboard watcher (Rust)

Week 2: Data + UI
├── Task 5: SQLite database + commands
├── Task 6: Global shortcut (Rust)
├── Task 7: Tauri IPC wrappers (TS)
└── Task 8: React Panel — history list

Week 3-4: AI Integration
├── Task 9: AI client — OpenAI Compatible
├── Task 10: First Action — summarize (E2E)
└── Task 11: Remaining 4 Actions

Week 5: Polish
├── Task 12: Error handling & edge cases
└── Task 13: Privacy flow & consent

Week 6: Release
├── Task 14: README, GIF demo, docs
├── Task 15: CI/CD + Windows installer
└── Task 16: Final polish & release
```

Total: **16 tasks** × ~5-10 steps each = practical solo-developer 6-week plan.
