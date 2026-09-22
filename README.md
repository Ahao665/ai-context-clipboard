<img src="docs/assets/banner.svg" alt="AI Context Clipboard" width="100%">

[![CI](https://github.com/Ahao665/ai-context-clipboard/actions/workflows/ci.yml/badge.svg)](https://github.com/Ahao665/ai-context-clipboard/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Ahao665/ai-context-clipboard)](https://github.com/Ahao665/ai-context-clipboard/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

Windows 剪贴板历史 + AI 处理。`Alt+Space` 呼出，搜历史，选中的内容直接跑总结 / 翻译 / 润色 / 回复 / 解释。

Tauri 2 + Rust，NSIS 包 3.2 MB，历史存本地 SQLite。不配 API Key 也能当普通剪贴板历史用。

## 起因

Windows 自带的剪贴板只能存 25 条，中文搜不了，也没 AI。Ditto 和 CopyQ 检索能力其实很强 —— 如果你只想要一个剪贴板历史工具，直接用它们，别用这个。

我做它是因为另一件事：复制完东西之后想干点什么，还是得自己来。流程一般是复制一段报错日志 → 切浏览器 → 打开 AI 网站 → 粘贴 → 敲提示词 → 等 → 复制回来。这工具就是把中间那几步省掉。

另外有三件事一开始就定了，后来没改过：数据不离开本机；调 AI 之前先把要发出去的内容给我看；不配 Key 也能用。

<img src="docs/assets/workflow.svg" alt="工作流程" width="100%">

## 装

Windows 10/11 x64，需要 WebView2（Win10 1803 以上自带）。

去 [Releases](../../releases/latest) 下载。NSIS 那个 3.2 MB，MSI 那个 4.5 MB（适合批量部署）。

没做代码签名，首次装可能弹 SmartScreen，点「仍要运行」即可。

自己编译：

```bash
git clone https://github.com/Ahao665/ai-context-clipboard.git
cd ai-context-clipboard
pnpm install
pnpm exec tauri build --bundles "msi,nsis"
```

要 Rust（MSVC 工具链）、Node 20+、pnpm、VS 2022 Build Tools。产物在 `src-tauri/target/release/bundle/`。

Git Bash 里编译如果报 `link: missing operand` 或 `LNK1181`，是 Git Bash 自带的 `link.exe` 挡住了 MSVC 链接器。[docs/BUILD-WINDOWS.md](docs/BUILD-WINDOWS.md) 里写了怎么绕。

## 用

装完启动就开始记录了，不用配置。要跑 AI 就按 `Alt+Space`，点右上角齿轮，选服务商、填 Key。

设置里能开关「每次调用前询问」、打开「跳过敏感内容」、看当前条数、清空历史。

快捷键：

| 键 | 作用 |
|---|---|
| `Alt+Space` | 呼出 / 收起面板 |
| `↑` `↓` | 选择 |
| `Enter` | 复制选中项并关闭面板；选中命令时执行该操作 |
| `Shift+Enter` | 打开详情 |
| `Esc` | 有输入时清空输入，输入为空时关闭 |

中文输入法组词期间（`isComposing`）按键会被忽略，不会打字打到一半把面板关掉。

## 几个实现上的取舍

**搜索用 FTS5 的 trigram tokenizer**，不是 LIKE，也不是默认分词器。trigram 能直接做子串匹配，中英混排不用额外分词，代价是索引体积大一些 —— 对这个数据量无所谓。

**内容识别全是本地正则，没调模型。** 判断是不是代码靠的是「至少 2 个代码特征 + 40% 以上行带代码标点 + 长度 ≥ 12」这种启发式，会有误判。但每次都发一次网络请求去判断类型，代价更不值。

**筛选放在后端执行。** 前端过滤只能过当前加载的那批，几百条之后结果就不对了。

**`packages/core` 不依赖任何框架** —— 没有 React、没有 Tauri、没有 Rust。提示词、类型识别、搜索排序都在这里，所以能用 node 直接跑测试，不用起整个应用。`src-tauri` 只管系统能力（剪贴板、数据库、快捷键、窗口），业务规则不写进 Rust。

## 支持的模型

兼容 OpenAI Chat Completions 协议，填 Base URL + Key + 模型名：

| | Base URL | 模型 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |

Ollama、vLLM、LM Studio 只要暴露兼容端点也能填。

## 已知问题

这些是当前版本真实存在的，不是「未来计划」：

- **`Alt+Space` 是写死的，界面上改不了。** 这个键 PowerToys Run 默认也在用。被占用时应用仍会启动（不会崩），但快捷键不会生效，同时窗口不会自动隐藏，stderr 里会有一行提示。
- **没有托盘图标，也没有开机自启。** `Cargo.toml` 里 `tray-icon` feature 是开着的，但没接代码。实际影响是：看不到应用是否在跑，也没法从界面退出，重启后要手动打开。
- **不能删单条记录，只能清空全部。** 后端 `delete_entry` 命令和前端 `deleteEntry()` 都写好了，但没有任何界面调用它。
- **AI 结果不能一键复制**，只能手动选中文本。
- **AI 请求没有超时和取消。** 网络卡住的话会一直停在「思考中...」，所有 AI 按钮保持禁用，只能重启应用。
- **开了「跳过敏感内容」之后没有任何提示。** 复制密钥类内容会静默不记录，容易以为程序坏了。
- **只处理文本剪贴板**（`CF_UNICODETEXT`）。复制图片不会有任何反应。
- **来源应用字段一直是空的。** `source_app` / `source_window` 建了列、界面也渲染了，但写入时恒为 `undefined`。
- **剪贴板内容没有大小上限。** 复制一个几十 MB 的文本会照单全收。
- **300 ms 轮询而不是事件驱动。** Windows 有 `AddClipboardFormatListener`，用它可以做到零轮询；现在的实现每秒调 3 次多 `OpenClipboard`，而且 300 ms 内连续复制两次会漏掉一次。

## 开发

```bash
pnpm install

pnpm exec tauri dev          # 热更新
pnpm typecheck               # types → core → ui
pnpm test                    # TS 测试，自动发现 packages/*/__tests__/*.test.ts
pnpm test content-type       # 只跑文件名匹配的

cd src-tauri && cargo test --lib storage::
```

195 个测试：TypeScript 161（15 个文件）+ Rust 34。

`cargo test` 里剪贴板相关的用例需要真实桌面会话，在无 GUI 的环境会挂住（不是失败，是一直等），所以日常用 `cargo test --lib storage::` 限定到存储层。CI 也这么做。

测试运行器会检查每个文件有没有输出测试摘要，退出码 0 但没摘要的算失败。之前有三个套件用 `console.assert` 断言 —— 它失败时只打日志不抛错，所以怎么跑都是绿的。

更多细节见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 贡献

Issue 和 PR 都欢迎。上面「已知问题」里的任何一条都是好的入手点，其中托盘、单条删除、AI 结果复制这三项改动都不大。

另外最缺的是一段真实录屏 GIF —— 现在 README 里只有流程图，看不到实际操作的样子。[docs/demo.gif.placeholder.md](docs/demo.gif.placeholder.md) 里有录制步骤和工具推荐（ScreenToGif）。

内容识别规则都集中在 `packages/core/src/detect/content-type.ts`，加规则加测试就行；`src-tauri/src/clipboard/` 是 Win32 专用的，要做跨平台从这里下手。

提交前跑一下 `pnpm typecheck`、`pnpm test`、`cargo test --lib storage::`。

## License

[Apache 2.0](LICENSE)
