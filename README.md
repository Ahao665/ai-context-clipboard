<img src="docs/assets/banner.svg" alt="AI Context Clipboard" width="100%">

[![CI](https://github.com/Ahao665/ai-context-clipboard/actions/workflows/ci.yml/badge.svg)](https://github.com/Ahao665/ai-context-clipboard/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Ahao665/ai-context-clipboard)](https://github.com/Ahao665/ai-context-clipboard/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

Windows 上的剪贴板历史工具，带 AI 处理。`Alt+Space` 呼出面板，搜索历史，选中内容直接跑总结 / 翻译 / 润色 / 回复 / 解释。

Tauri 2 + Rust 写后端，NSIS 安装包 3.2 MB，历史存在本地 SQLite 里。不配 API Key 也能当普通剪贴板历史用。

## 为什么写这个

Windows 自带剪贴板只能存 25 条，中文搜不了，也没有 AI。Ditto 和 CopyQ 的检索能力其实很强，但复制完想干点什么，还是得自己来。

我自己的流程一般是：复制一段报错日志 → 切到浏览器 → 打开某个 AI 网站 → 粘贴 → 敲提示词 → 等 → 复制回来。这个工具就是把中间那几步省掉。

有三件事是一开始就定下来的，后来也没改过：数据不离开本机；调 AI 之前先把要发出去的内容给我看；不配 Key 也要能用。

## 功能

**搜索**。全历史走 SQLite FTS5 的 trigram 索引，中英文子串都能命中。不是只搜当前加载的那几十条 —— 之前有个版本就是这样，几百条之后基本等于搜不到。

**内容识别**。复制后自动判断是链接、代码、JSON、邮箱还是普通文本，代码会再细分语言。纯本地正则启发式，不发网络请求。

**敏感内容保护**。识别私钥、`password=` / `api_key=` 这类赋值、`sk-` / `ghp_` / `AKIA` 前缀、JWT、数据库连接串。识别到的会打标记；在设置里打开「跳过敏感内容」后，这类内容根本不写进数据库。

**置顶**。常用片段钉在最上面，列表和搜索用同一套排序。

**类型筛选**。按链接 / 代码 / JSON / 邮箱 / 文本过滤。筛选在后端执行，所以是过滤全部历史而不是当前窗口。

**AI 操作**。总结、翻译、润色、回复、解释。提示词都在 `packages/core/src/actions/` 下，想改直接改，不用碰别的地方。

**历史维护**。条数上限会真实生效（不是写进配置就完事），支持软删除 + 物理清理（`VACUUM`），可以一键清空。

## 和其他工具的关系

定位不一样。Ditto、CopyQ 是通用剪贴板管理器，能做的事比这个多得多，如果你只想要一个剪贴板历史工具，直接用它们就行。这个项目的重点在「复制完之后的下一步」。

中文搜索是另一个差异点。FTS5 的 trigram tokenizer 可以直接做子串匹配，不需要额外分词，所以中英混排的内容也能搜。

## 安装

Windows 10 / 11 (x64)。需要 WebView2，Win10 1803 以上已经内置了。

从 [Releases](../../releases/latest) 下载：

| 文件 | 体积 |
|---|---|
| `AI.Context.Clipboard_0.3.0_x64-setup.exe`（NSIS） | 3.2 MB |
| `AI.Context.Clipboard_0.3.0_x64_en-US.msi` | 4.5 MB |

没做代码签名，首次安装 Windows 可能弹 SmartScreen，点「仍要运行」即可。

从源码构建：

```bash
git clone https://github.com/Ahao665/ai-context-clipboard.git
cd ai-context-clipboard
pnpm install
pnpm exec tauri build --bundles "msi,nsis"
```

需要 Rust（MSVC 工具链）、Node.js 20+、pnpm、VS 2022 Build Tools。产物在 `src-tauri/target/release/bundle/`。

如果你在 Git Bash 里构建碰到 `link: missing operand` 或者 `LNK1181`，那是 Git Bash 自带的 `link.exe` 遮蔽了 MSVC 的链接器，[docs/BUILD-WINDOWS.md](docs/BUILD-WINDOWS.md) 里有完整的处理步骤。

## 用法

装完启动就开始记录了，不需要任何配置。要跑 AI 的话按 `Alt+Space`，点右上角齿轮，选服务商预设、填 API Key。

设置里可以开关「每次调用前询问」、打开「跳过敏感内容」、看当前历史条数、清空历史。

| 按键 | 行为 |
|---|---|
| `Alt+Space` | 全局呼出 / 收起 |
| `↑` `↓` | 移动选择 |
| `Enter` | 复制选中项并关闭；选中命令时执行该 AI 操作 |
| `Shift+Enter` | 打开详情 |
| `Esc` | 有输入时清空输入，输入为空时关闭 |

输入法组词期间（`isComposing`）所有按键都会被忽略，不会出现打字打到一半把面板关掉的情况。

## 支持的 AI 服务

兼容 OpenAI Chat Completions 协议：

| 服务 | Base URL | 模型示例 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |

Ollama、vLLM、LM Studio 之类只要暴露 OpenAI 兼容端点，也能直接填进去。

## 隐私

- 监听、识别、存储、搜索都在本机完成，不发网络请求。
- 只有你主动点 AI 操作时才会请求，而且发送前会把完整内容显示出来让你确认。
- API Key 只存在本地设置表里，不写日志，`.gitignore` 已经排除了 `.env*`。
- 数据库是应用数据目录下的单个 SQLite 文件，想删直接删。

## 项目结构

<img src="docs/assets/workflow.svg" alt="工作流程" width="100%">

```
ai-context-clipboard/
├── packages/
│   ├── types/                      # 共享 TypeScript 类型
│   ├── core/                       # 纯业务逻辑，零框架依赖
│   │   ├── ai/client.ts            # OpenAI Compatible 客户端
│   │   ├── actions/                # 提示词：summarize / translate / rewrite / reply / explain
│   │   ├── detect/content-type.ts  # 内容类型与敏感信息识别
│   │   ├── palette/                # 搜索排序、模糊匹配、命令定义
│   │   └── event-bus.ts
│   └── ui/                         # React 界面
│       ├── components/             # CommandPalette / TypeFilter / SettingsPanel …
│       ├── hooks/                  # useClipboard / usePaletteSearch / useAI
│       ├── lib/                    # palette-compose / provider-presets / entry-preview
│       └── stores/                 # Zustand
├── src-tauri/                      # Rust 系统层
│   ├── clipboard/watcher.rs        # Win32 剪贴板监听
│   ├── storage/
│   │   ├── db.rs                   # 连接、建表、幂等迁移
│   │   ├── entries.rs              # 增删改查 + FTS5 搜索 + 置顶
│   │   └── maintenance.rs          # 计数、清理、容量控制、VACUUM
│   ├── commands/                   # Tauri IPC 命令
│   └── shortcut/manager.rs         # 全局快捷键
└── docs/
```

分层上有个约定：`packages/core` 不依赖任何框架 —— 没有 React、没有 Tauri、没有 Rust。提示词构建、类型识别、搜索排序都在这里，所以可以直接用 node 脚本跑测试，不用起整个应用。`src-tauri` 只负责系统能力（剪贴板、数据库、快捷键、窗口），业务规则不写在 Rust 里。

技术栈：Tauri 2 / React 18 + TypeScript + Vite / Zustand / rusqlite + FTS5 / Win32 API（`CF_UNICODETEXT`）/ tauri-plugin-global-shortcut。

## 开发

```bash
pnpm install

pnpm exec tauri dev          # 开发模式，热更新
pnpm typecheck               # types → core → ui
pnpm test                    # TS 测试，自动发现 packages/*/__tests__/*.test.ts
pnpm test content-type       # 只跑文件名匹配的

cd src-tauri && cargo test --lib storage::
```

目前 195 个测试：TypeScript 161 个（15 个文件），Rust 34 个。

`cargo test` 里剪贴板相关的用例需要真实桌面会话，在没有 GUI 的后台环境会永久阻塞（不是失败，是挂住），所以日常用 `cargo test --lib storage::` 限定到存储层。CI 也是这么做的。

测试运行器会检查每个文件有没有输出测试摘要：退出码 0 但没摘要的判为失败。之前有三个套件用 `console.assert` 断言，失败时只打日志不抛错，所以怎么跑都是绿的 —— 这条规则就是为了防止这种情况再次发生。

更多细节见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 还没做的

- 图片剪贴板（目前只处理 `CF_UNICODETEXT`）
- 自定义 AI 操作、可编辑提示词
- 历史导入 / 导出
- macOS / Linux（剪贴板层要整个重写）
- 界面多语言（现在基本是中文）

## 贡献

Issue 和 PR 都欢迎。目前最缺的是一段**真实录屏 GIF** —— README 里现在只有流程图，看不到实际操作的样子。[docs/demo.gif.placeholder.md](docs/demo.gif.placeholder.md) 里写了录制步骤和推荐工具（ScreenToGif）。

另外 `src-tauri/src/clipboard/` 是 Win32 专用的，要做跨平台得从这里下手；内容类型识别规则集中在 `packages/core/src/detect/content-type.ts`，加规则加测试就行。

提交前跑一下 `pnpm typecheck`、`pnpm test`、`cargo test --lib storage::`。

## License

[Apache 2.0](LICENSE)
