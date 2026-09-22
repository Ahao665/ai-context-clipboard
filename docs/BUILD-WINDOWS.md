# Windows 构建环境（MSVC 链接器）

在 **Git Bash / MSYS2** 环境下，`cargo build` / `cargo test` 会失败：

```
error: linking with `link.exe` failed: exit code: 1
note: link: missing operand after '\377\376'
note: `link.exe` returned an unexpected error
```

## 原因

Git Bash 自带一个 Unix 的 `link.exe`（coreutils 的硬链接工具），位于：

```
<Git>\usr\bin\link.exe
```

它出现在 `PATH` 中，并且**排在 MSVC 的 `link.exe` 前面**。Rust 的 `x86_64-pc-windows-msvc`
目标在链接阶段调用 `link.exe`，于是拿到了这个 Unix 工具而不是 MSVC 链接器。

本机 `where link.exe` 的输出还会显示乱码路径（`C:\Users\ºÀºÀ\...`），因为用户名含中文
`豪豪`，在 GBK/UTF-8 转换中损坏 —— 这会导致参数被解释成 `\377\376`，正是上面
`missing operand after '\377\376'` 的来源。

## 解决

仓库里带了一个可以直接 source 的脚本：

```bash
source scripts/msvc-env.sh
cd src-tauri && cargo test
```

它做的事就是把 MSVC 的 bin 目录**前置**到 `PATH`，并设置 `LIB` / `INCLUDE`。
展开写出来是这样（`vcvars64.bat` 是最省事的办法，但在 Git Bash 里直接 `cmd /c`
常拿不到输出，所以脚本里用的是显式设置）：

```bash
MSVC="/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207"
SDKV="10.0.26100.0"

export LIB="C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\lib\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\$SDKV\\ucrt\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\$SDKV\\um\\x64"
export INCLUDE="C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\include;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\$SDKV\\ucrt;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\$SDKV\\um;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\$SDKV\\shared"
export PATH="$MSVC/bin/Hostx64/x64:$PATH"
export CARGO_INCREMENTAL=0

cd src-tauri && cargo test
```

脚本里的版本号是写死的。Visual Studio 更新之后路径会变，脚本会明确报错并提示去哪找新版本，
不会静默地用错工具链。

验证链接器已正确解析：

```bash
which link
# 应输出 .../Hostx64/x64/link  （不是 <Git>/usr/bin/link）

link 2>&1 | head -2
# 应输出 Microsoft (R) Incremental Linker Version ...
```

> 更省事的替代方案：在「Developer Command Prompt for VS 2022」里运行 cargo，
> 或用 PowerShell 先执行 `vcvars64.bat`。上面的写法适合脚本化 / CI。

## 关于 `cargo test` 卡住

`clipboard::writer::tests::*`（5 个用例）需要真实的 Windows 剪贴板。在无桌面会话的
后台环境里这些用例会阻塞，表现为 `cargo test` 长时间无输出 —— 不是失败，是一直等。

CI 上排除它们，只跑纯逻辑部分：

```bash
cd src-tauri && cargo test --lib -- storage:: clipboard::watcher:: clipboard::image:: shortcut:: commands::
```

本地有桌面会话的话跑全量（`cargo test --lib`）。那 5 个里有一个是真实的图片写入-读回
往返，比对像素是否一致 —— 它是唯一能发现「粘贴出来上下颠倒」的测试，所以本地值得跑。

## 关于 `target/` 的体积

`target/` 是纯构建缓存，删掉安全（`cargo clean`），下次构建重新生成，只是会慢几分钟。
它不是源码，`.gitignore` 里已经排除，**不要**想办法提交到 GitHub —— 里面的
`.pdb` / `.lib` 单个就有几百 MB，GitHub 会直接拒绝，而且产物跟本机的 MSVC 版本、
SDK 版本、绝对路径绑定，换台机器一点用都没有。

`target/debug/incremental/` 通常占最大头。不需要增量编译的话在 `scripts/msvc-env.sh`
里设的 `CARGO_INCREMENTAL=0` 能省下这部分，代价是每次改动后重新编译整个 crate 图。

## 关于构建产物被锁

若上一次构建被中断（例如 Ctrl+C / 进程被杀），`target/debug` 可能残留
`cargo.exe` 进程并持有构建锁，导致后续构建一直"running"却没有输出。
清理后重试：

```bash
tasklist | grep -i cargo      # 查看残留进程
taskkill /F /IM cargo.exe     # 逐个结束（避免杀到正在使用的进程）
```
