<img src="docs/assets/banner.svg" alt="AI Context Clipboard" width="100%">

[![CI](https://github.com/Ahao665/ai-context-clipboard/actions/workflows/ci.yml/badge.svg)](https://github.com/Ahao665/ai-context-clipboard/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Ahao665/ai-context-clipboard)](https://github.com/Ahao665/ai-context-clipboard/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

Windows 剪贴板历史 + AI 处理。`Alt+Space` 呼出，搜历史，选中的内容直接跑总结 / 翻译 / 润色 / 回复 / 解释。文本和截图都记。

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

设置里能开关「每次调用前询问」、「跳过疑似敏感内容」和「开机自启」，改快捷键，看当前条数，清空历史。

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
- **图片也能进历史**。截图或复制图片会存成一条记录，列表里显示缩略图，详情页显示原图，可以一键复制回剪贴板。图片不走 AI 动作 —— 它没有文字，硬塞给模型没意义。

## 几个实现上的取舍

**搜索用 FTS5 的 trigram tokenizer**，不是 LIKE，也不是默认分词器。trigram 能直接做子串匹配，中英混排不用额外分词，代价是索引体积大一些 —— 对这个数据量无所谓。

**内容识别全是本地正则，没调模型。** 判断是不是代码靠的是「至少 2 个代码特征 + 40% 以上行带代码标点 + 长度 ≥ 12」这种启发式，会有误判。但每次都发一次网络请求去判断类型，代价更不值。

**筛选放在后端执行。** 前端过滤只能过当前加载的那批，几百条之后结果就不对了。

**剪贴板靠 `AddClipboardFormatListener` 事件驱动，不轮询。** 建一个 message-only 窗口收 `WM_CLIPBOARDUPDATE`，收到就立刻读。之前的实现是每 300 ms 轮询一次，300 ms 内连按两次 Ctrl+C 会漏掉一次。收到事件后还会重试几次 `OpenClipboard` —— 刚按完 Ctrl+C 的那一瞬间，源程序通常还占着剪贴板，立刻放弃就是漏抓的主要原因。注册监听失败会退回轮询，慢总比没有强。

**来源应用是读剪贴板那一刻的前台窗口。** 按 Ctrl+C 不会改变前台窗口，所以正常情况下这就是你复制的那个程序。但如果你复制完立刻切窗口，就可能记成切过去的那个。要更准得用 `SetWinEventHook` 跟踪焦点变化，暂时没做。

**快捷键注册失败不是崩溃，是正常分支。** `RegisterHotKey` 在组合被占用时会失败，`Alt+Space` 恰好是 PowerToys Run 的默认键。所以设置里改快捷键失败会明确报错，并且把原来的键恢复回去 —— 包括运行时和数据库里的值，不会出现「存了一个用不了的键」。

**图片存的是 BMP，不是 PNG。** 剪贴板给的本来就是 `CF_DIB`（一个没有文件头、只有 `BITMAPINFOHEADER` 加像素的裸结构），套个 BMP 文件头就能直接落盘、WebView 也能直接渲染 —— 全程不需要图像编解码库，也就不需要多一个依赖。代价是文件大（一张 1920×1080 截图约 6 MB）。另外 32 位 `BI_RGB` 的截图，第四个字节通常是 0，渲染器会把它当「全透明」，所以解码时那个字节是**丢掉**的：保留它得到的是一个看不见的图片。行宽按 4 字节对齐，解码和缩略图降采样都得按 stride 走，不能当成紧凑数组。

**图片元数据走 IPC，字节走磁盘。** 剪贴板事件里只传文件名、尺寸和字节数；真正取图是列表行滚动到可见时才发一次请求，缩略图另存了一份 320px 的降采样副本。一张截图转 base64 有 8 MB 上下，每条记录都塞进事件里会让面板在每次截图时卡一下。缩略图缓存也有上限（40 条），超了按插入顺序淘汰 —— 一条 `Map` 天然就是个 LRU 队列。

**复制图片回剪贴板写的是 `CF_DIB`，不是 `CF_BITMAP`。** 后者要建一个跟屏幕 DC 绑定的设备相关位图、还要交给剪贴板接管，错一步就很难查；而认图片的消费者都认 DIB。写出去之前会把行序翻回自下而上、把 `biHeight` 改成正值 —— 负高度的 DIB 合法，但不少程序仍然按老规矩读，粘贴出来是上下颠倒的图片，这种 bug 只有肉眼才看得出来。

**开机自启直接写注册表，没引 autostart 插件。** 项目本来就是 Windows-only，剪贴板那块已经在调 Win32，所以往 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 写一个值就够了，不必为此多一个依赖 —— 安装包体积也是这么省下来的。选 `HKCU` 而不是 `HKLM`：前者不需要管理员权限，而且任务管理器的「启动」标签里能看到、能关掉，用户在那边关掉之后程序不该再自作主张加回来。默认关闭，只有主动打开才会写。判断「当前开没开」也是读注册表而不是读自己的设置表 —— 用户可能已经从任务管理器里关了它，存一个标志位只会和现实对不上。

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

- **图片只认未压缩的 24/32 位位图**（`BI_RGB`）。8 位、RLE 压缩的图会被跳过，跳过时会往 `stderr` 写一行原因。更麻烦的是只往剪贴板放 PNG（不放 `CF_DIB`）的程序 —— 那种情况什么都读不到，因为读 PNG 就得引图像库。
- **删图片不会立刻释放磁盘。** 删除是软删，BMP 文件留在 `images/` 里；要真正回收得走「清理已删除」。这是刻意的：软删可恢复，物理删除不可逆。同一条内容重新复制会产生新记录但复用同一个文件，所以回收时只删没有任何存活记录引用的文件。
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

286 个测试：TypeScript 186（16 个文件）+ Rust 100。

`cargo test --lib` 里有九个用例要真实桌面会话（`clipboard::writer` 的 5 个往返测试 + `clipboard::watcher::desktop` 的 4 个捕获测试），无 GUI 环境会挂住（不是失败，是一直等），所以 CI 跳过它们：

```bash
cd src-tauri && cargo test --lib -- --skip clipboard::writer:: --skip clipboard::watcher::desktop::
```

CI 上跑 91 个，本地跑 100 个。跳过的那九个是真的在读写系统剪贴板：图片写进去再读回来比对像素、截图落盘后是否和源字节一致、以及**同时有文字和图片时文字优先**。最后一条尤其值得本地跑 —— 它错了的话，从浏览器里复制会存成一张截图，而且不报任何错。

用 `--skip` 而不是列一串要跑的模块，是因为白名单得在每次加模块时手动更新，而且前缀匹配很容易误伤：为了让新的 `clipboard::image` 跑起来而写成 `clipboard::`，会把本来要排除的 `clipboard::writer` 一起放回来。

测试运行器会检查每个文件有没有输出测试摘要，退出码 0 但没摘要的算失败。之前有三个套件用 `console.assert` 断言 —— 它失败时只打日志不抛错，所以怎么跑都是绿的。

更多细节见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 贡献

Issue 和 PR 都欢迎。上面「已知问题」里没几项了，剩的基本都是需要外部条件才能做的（代码签名、录屏）。

另外最缺的是一段真实录屏 GIF —— 现在 README 里只有流程图，看不到实际操作的样子。[docs/demo.gif.placeholder.md](docs/demo.gif.placeholder.md) 里有录制步骤和工具推荐（ScreenToGif）。

内容识别规则都集中在 `packages/core/src/detect/content-type.ts`，加规则加测试就行；`src-tauri/src/clipboard/` 是 Win32 专用的，要做跨平台从这里下手。

提交前跑一下 `pnpm typecheck`、`pnpm test`、`cargo test --lib`。

## License

[Apache 2.0](LICENSE)
