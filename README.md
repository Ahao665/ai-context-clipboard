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

应用没有主窗口概念，托盘图标就是它的存在感。左键单击托盘 = 显示/隐藏面板，右键出菜单：显示/隐藏、设置、退出。**点窗口的 ✕ 是隐藏，不是退出** —— 退出走托盘菜单。

设置里能开关「每次调用前询问」和「跳过疑似敏感内容」，改快捷键，看当前条数，清空历史。

快捷键：

| 键 | 作用 |
|---|---|
| `Alt+Space` | 呼出 / 收起面板（可在设置里改） |
| `↑` `↓` | 选择 |
| `Enter` | 复制选中项并关闭面板；选中命令时执行该操作 |
| `Shift+Enter` | 打开详情 |
| `Esc` | 有输入时清空输入，输入为空时关闭 |

中文输入法组词期间（`isComposing`）按键会被忽略，不会打字打到一半把面板关掉。

几个不那么显然的行为：

- **列表里每条右边有删除按钮**，第一次点会变成「删除?」，再点一次才真的删，3 秒不动就自己取消。详情页右上角同理。以前只能「清空全部」。
- **AI 结果旁边有复制按钮**，直接写回系统剪贴板。请求跑着的时候那里是「取消」。
- **复制一条已经在历史里的内容不会产生新记录**，靠内容哈希去重。但复制 AI 结果是新内容，所以它会作为一条新记录存进去。
- **超长内容会被截断**。超过 20 万字符只存前 20 万，然后在面板顶部提示一次；记录里的「大小」仍然是原始长度。
- **开了「跳过敏感内容」时，被跳过的复制会在面板顶部提示**，不会静默吞掉。

## 几个实现上的取舍

**搜索用 FTS5 的 trigram tokenizer**，不是 LIKE，也不是默认分词器。trigram 能直接做子串匹配，中英混排不用额外分词，代价是索引体积大一些 —— 对这个数据量无所谓。

**内容识别全是本地正则，没调模型。** 判断是不是代码靠的是「至少 2 个代码特征 + 40% 以上行带代码标点 + 长度 ≥ 12」这种启发式，会有误判。但每次都发一次网络请求去判断类型，代价更不值。

**筛选放在后端执行。** 前端过滤只能过当前加载的那批，几百条之后结果就不对了。

**剪贴板靠 `AddClipboardFormatListener` 事件驱动，不轮询。** 建一个 message-only 窗口收 `WM_CLIPBOARDUPDATE`，收到就立刻读。之前的实现是每 300 ms 轮询一次，300 ms 内连按两次 Ctrl+C 会漏掉一次。收到事件后还会重试几次 `OpenClipboard` —— 刚按完 Ctrl+C 的那一瞬间，源程序通常还占着剪贴板，立刻放弃就是漏抓的主要原因。注册监听失败会退回轮询，慢总比没有强。

**来源应用是读剪贴板那一刻的前台窗口。** 按 Ctrl+C 不会改变前台窗口，所以正常情况下这就是你复制的那个程序。但如果你复制完立刻切窗口，就可能记成切过去的那个。要更准得用 `SetWinEventHook` 跟踪焦点变化，暂时没做。

**快捷键注册失败不是崩溃，是正常分支。** `RegisterHotKey` 在组合被占用时会失败，`Alt+Space` 恰好是 PowerToys Run 的默认键。所以设置里改快捷键失败会明确报错，并且把原来的键恢复回去 —— 包括运行时和数据库里的值，不会出现「存了一个用不了的键」。

**`packages/core` 不依赖任何框架** —— 没有 React、没有 Tauri、没有 Rust。提示词、类型识别、搜索排序都在这里，所以能用 node 直接跑测试，不用起整个应用。`src-tauri` 只管系统能力（剪贴板、数据库、快捷键、窗口、托盘），业务规则不写进 Rust。

## 支持的模型

兼容 OpenAI Chat Completions 协议，填 Base URL + Key + 模型名：

| | Base URL | 模型 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |

Ollama、vLLM、LM Studio 只要暴露兼容端点也能填。

请求有 60 秒超时，也可以手动取消。

## 已知问题

这些是当前版本真实存在的，不是「未来计划」：

- **只处理文本剪贴板**（`CF_UNICODETEXT`）。复制图片不会有任何反应，也没提示。要支持得走 `CF_DIB` + 存文件 + 缩略图，是一整块新工作。
- **没有开机自启。** 关掉之后要手动打开，或者把快捷方式丢进启动目录。Tauri 有 autostart 插件，接上不难，但会往注册表写东西，想先问过用的人。
- **设置面板录制快捷键时，按 `Esc` 是取消，不能绑 `Esc`。** 另外系统级组合（`Win+…`）拿不到，Windows 不让注册。
- **敏感内容识别是启发式的**，会漏也会误判。别把它当成保险，它只是减少误存，不是防止泄露。
- **没有代码签名**，SmartScreen 会拦。
- **README 里没有真实录屏 GIF**，只有流程图。[docs/demo.gif.placeholder.md](docs/demo.gif.placeholder.md) 里有录制步骤和工具推荐（ScreenToGif）。

## 开发

```bash
pnpm install

pnpm exec tauri dev          # 热更新
pnpm typecheck               # types → core → ui
pnpm test                    # TS 测试，自动发现 packages/*/__tests__/*.test.ts
pnpm test content-type       # 只跑文件名匹配的

cd src-tauri && cargo test --lib
```

232 个测试：TypeScript 178（16 个文件）+ Rust 54。

`cargo test --lib` 里 `clipboard::writer` 那三个用例要真实桌面会话，无 GUI 环境会挂住（不是失败，是一直等），所以 CI 限定到三个纯逻辑模块：

```bash
cd src-tauri && cargo test --lib -- storage:: clipboard::watcher:: shortcut::
```

测试运行器会检查每个文件有没有输出测试摘要，退出码 0 但没摘要的算失败。之前有三个套件用 `console.assert` 断言 —— 它失败时只打日志不抛错，所以怎么跑都是绿的。

更多细节见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 贡献

Issue 和 PR 都欢迎。上面「已知问题」里的图片剪贴板和开机自启都是自成一块的活，不太会碰到别的地方。

另外最缺的是一段真实录屏 GIF —— 现在 README 里只有流程图，看不到实际操作的样子。[docs/demo.gif.placeholder.md](docs/demo.gif.placeholder.md) 里有录制步骤和工具推荐（ScreenToGif）。

内容识别规则都集中在 `packages/core/src/detect/content-type.ts`，加规则加测试就行；`src-tauri/src/clipboard/` 是 Win32 专用的，要做跨平台从这里下手。

提交前跑一下 `pnpm typecheck`、`pnpm test`、`cargo test --lib`。

## License

[Apache 2.0](LICENSE)
