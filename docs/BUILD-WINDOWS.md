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

在调用 cargo 前，把 MSVC 的 bin 目录**前置**到 `PATH`，并设置 `LIB` / `INCLUDE`。
（`vcvars64.bat` 是最省事的办法，但在 Git Bash 里直接 `cmd /c` 常拿不到输出，
所以下面给出显式设置的方式。）

```bash
MSVC="/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207"
SDKV="10.0.26100.0"

export LIB="C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\lib\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\$SDKV\\ucrt\\x64;C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\$SDKV\\um\\x64"
export INCLUDE="C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\include;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\$SDKV\\ucrt;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\$SDKV\\um;C:\\Program Files (x86)\\Windows Kits\\10\\Include\\$SDKV\\shared"
export PATH="$MSVC/bin/Hostx64/x64:$PATH"
export CARGO_INCREMENTAL=0

cd src-tauri && cargo test
```

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

`clipboard::writer::tests::*` 需要真实的 Windows 剪贴板。在无桌面会话的后台环境里
这些用例会阻塞，表现为 `cargo test` 长时间无输出。

只跑存储层的测试：

```bash
cd src-tauri && cargo test --lib storage::
```

## 关于构建产物被锁

若上一次构建被中断（例如 Ctrl+C / 进程被杀），`target/debug` 可能残留
`cargo.exe` 进程并持有构建锁，导致后续构建一直"running"却没有输出。
清理后重试：

```bash
tasklist | grep -i cargo      # 查看残留进程
taskkill /F /IM cargo.exe     # 逐个结束（避免杀到正在使用的进程）
```
