# AI Context Clipboard

> 不是普通剪贴板管理工具，而是你的本地 AI 助手入口。

![Demo](docs/demo.gif)

Ctrl+C 复制任何内容 → AI 自动理解 → 一键 AI 处理。  
用 Rust 构建的 Windows 桌面应用，数据本地存储，AI 透明可控。

---

## ✨ 功能

- **智能剪贴板监听** — 自动保存复制内容，SHA256 去重（300ms 轮询）
- **一键 AI 处理** — 总结、翻译、润色、回复、解释，5 种智能操作
- **本地优先存储** — SQLite 存储历史，数据不出本机
- **全局快捷键** — Alt+Space 在任何应用中呼出面板
- **全文搜索** — 对剪贴板历史进行即时搜索
- **隐私确认** — 首次 AI 调用需用户授权，内容明确展示
- **多模型支持** — 兼容 OpenAI、DeepSeek、Qwen 等 API

## 🖥️ 系统要求

- Windows 10/11 (x64)
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (Windows 10 1803+ 已内置)

## 📥 安装

从 [Releases](https://github.com/yourname/ai-context-clipboard/releases) 下载最新 `.msi` 安装包：

```bash
# 直接双击安装，或命令行：
msiexec /i ai-context-clipboard-0.1.0.msi
```

### 从源码构建

```bash
# 1. 安装 Rust (https://rustup.rs)
# 2. 安装 Node.js 20+ 和 pnpm
pnpm install
cd src-tauri && cargo tauri build
```

## 🚀 快速开始

### 1. 启动应用

安装后运行 AI Context Clipboard，应用在后台运行。

### 2. 配置 AI API

1. 按 `Alt+Space` 打开主面板
2. 点击 ⚙️ 设置按钮
3. 填写你的 API Key 和模型

### 3. 使用 AI 功能

1. 复制任意文本（Ctrl+C）
2. 按 `Alt+Space` 打开面板
3. 点击文本条目查看详情
4. 选择 AI 操作：

| 操作 | 说明 |
|------|------|
| 📝 **总结** | 提取内容要点，分点列出 |
| 🌐 **翻译** | 将内容翻译成中文 |
| ✨ **润色** | 改进表达，更清晰专业 |
| 💬 **回复** | 根据内容生成自然回复 |
| 🔍 **解释** | 用简单语言解释复杂内容 |

5. AI 结果在面板内展示

### 4. 隐私确认

首次使用 AI 功能时，会弹出隐私确认对话框，明确展示即将发送的内容。
你可以选择「不再提示」，或在设置中重新开启。

## 🔌 支持的 AI API

本应用兼容 OpenAI Chat Completions API 格式，支持以下服务：

| 服务 | Base URL | 推荐模型 |
|------|----------|----------|
| [OpenAI](https://platform.openai.com) | `https://api.openai.com/v1` | `gpt-4o-mini` |
| [DeepSeek](https://platform.deepseek.com) | `https://api.deepseek.com/v1` | `deepseek-chat` |
| [通义千问](https://help.aliyun.com/zh/model-studio) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| [Kimi](https://platform.moonshot.cn) | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 任何 OpenAI 兼容服务 | 自定义 URL | 自定义模型 |

## 🔒 隐私与安全

- **本地存储**：所有剪贴板历史存储在本地 SQLite 数据库
- **AI 调用透明**：每次 AI 处理前展示即将发送的内容
- **不自动上传**：只有用户主动点击 AI 操作时才会发送数据
- **API Key 安全**：密钥存储在应用设置中，不会在日志中暴露
- **无后台联网**：应用仅在 AI 调用时出站请求

## 🏗️ 项目架构

```
ai-context-clipboard/
├── packages/
│   ├── types/                # 共享 TypeScript 类型定义
│   ├── core/                 # 纯业务逻辑 (零框架依赖)
│   │   ├── event-bus.ts      # 事件总线
│   │   ├── ai/client.ts      # OpenAI Compatible 客户端
│   │   └── actions/          # AI 操作引擎
│   │       ├── summarize.ts  # 总结
│   │       ├── translate.ts  # 翻译
│   │       ├── rewrite.ts    # 润色
│   │       ├── reply.ts      # 回复
│   │       └── explain.ts    # 解释
│   └── ui/                   # React 界面
│       ├── components/       # UI 组件
│       ├── hooks/            # React Hooks
│       └── stores/           # Zustand 状态管理
├── src-tauri/                # Rust 系统层
│   ├── clipboard/watcher.rs  # 剪贴板监听 (Win32 API)
│   ├── storage/              # SQLite 数据库
│   ├── commands/             # Tauri IPC 命令
│   └── shortcut/             # 全局快捷键
└── docs/                     # 文档
```

### 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2 |
| 前端 | React 18 + TypeScript + Vite |
| 状态管理 | Zustand |
| 后端 | Rust (rusqlite, serde, windows crate) |
| AI 协议 | OpenAI Compatible API |
| 快捷键 | tauri-plugin-global-shortcut |
| 数据库 | SQLite (bundled via rusqlite) |

## 🧪 开发

```bash
# 安装依赖
pnpm install

# 启动开发模式
cd src-tauri && cargo tauri dev

# TypeScript 类型检查
pnpm typecheck

# 运行 Rust 测试
cd src-tauri && cargo test

# 运行 TypeScript 测试
npx tsx packages/core/__tests__/*.test.ts

# 构建发布版
cd src-tauri && cargo tauri build
```

详细开发指南见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 📄 协议

[Apache License 2.0](LICENSE)

---

**Made with ❤️ for AI-powered productivity**
