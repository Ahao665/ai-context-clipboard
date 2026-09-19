# Development Guide

## 环境要求

- **Rust**: 1.75+ (需要 MSVC 工具链)
- **Node.js**: 20+
- **pnpm**: 8+
- **Visual Studio 2022 Build Tools**: 包含 "使用 C++ 的桌面开发" 工作负载
  - MSVC v143 生成工具
  - Windows 10/11 SDK

## 快速开始

```bash
# 克隆项目
git clone https://github.com/yourname/ai-context-clipboard.git
cd ai-context-clipboard

# 安装前端依赖
pnpm install

# 启动开发服务器 (hot-reload)
cd src-tauri && cargo tauri dev
```

## 测试

```bash
# TypeScript 类型检查 (全部 packages)
pnpm typecheck

# TypeScript 测试 —— 自动发现 packages/*/__tests__/*.test.ts
pnpm test

# 只跑文件名匹配的测试文件
pnpm test content-type

# Rust 测试
cd src-tauri && cargo test --lib storage::
```

### 关于 `cargo test` 的范围

剪贴板用例（`clipboard::writer::tests::*`）需要**真实的桌面会话**才能访问系统剪贴板。
在无 GUI 的后台会话中它们会**永久阻塞**（不是失败，是挂住），因此：

- 本地日常开发用 `cargo test --lib storage::` 限定到存储层（34 个用例，秒级完成）。
- 需要全量验证时，请在真实桌面终端里跑完整 `cargo test`。
- CI 同样只跑 `storage::`，见 `.github/workflows/ci.yml`。

### 关于 TypeScript 测试运行器

`scripts/run-tests.mjs` 会扫描 `packages/*/__tests__/*.test.ts`，对每个文件用
`node --import tsx` 起独立进程执行，再汇总结果与退出码。

这样做的原因：以前 `package.json` 的 `test` 脚本硬编码了文件清单，新增测试文件
（如 `content-type.test.ts`）会被静默跳过——测试看着是绿的，其实根本没跑。
现在新增文件无需登记。

## 构建

```bash
cd src-tauri && cargo tauri build
```

构建产物在 `src-tauri/target/release/bundle/`。

### MSI 安装包（WiX）

```bash
cd src-tauri && cargo tauri build --bundles msi
```

- **WiX Toolset 无需手动安装**：Tauri 在首次 MSI 打包时会自动从 GitHub 下载 WiX（
  `wix314-binaries.zip`）并缓存到 `%LOCALAPPDATA%\tauri\WixTools314\`。
- ⚠️ **首次打包必须联网**，且**不要中断构建进程**——上次后台构建就是在 WiX 下载/
  打包完成前被终止，导致 `bundle/msi/` 目录从未生成，但 release `.exe` 却已产出，
  表现很像「MSI 打包失败」。
- MSI 产物位于 `src-tauri/target/release/bundle/msi/*.msi`。
- 离线环境可手动把 `candle.exe`/`light.exe` 放入 `%LOCALAPPDATA%\tauri\WixTools314\`
  跳过自动下载。

## 项目结构

```
packages/types/     — 共享类型定义 (零运行时依赖)
packages/core/      — 纯业务逻辑 (零 React/Tauri/Rust 依赖)
packages/ui/        — React UI (Vite + Zustand)
src-tauri/          — Rust 系统层 (剪贴板/SQLite/快捷键/IPC)
docs/               — 文档
.github/            — CI/CD 配置
```

## 添加新 AI 操作

1. 在 `packages/core/src/actions/` 下创建操作文件
2. 使用 `executeAction` 共享函数处理错误和验证
3. 在 `packages/core/src/index.ts` 中导出
4. 在 `packages/ui/src/hooks/useAI.ts` 中添加 runner
5. 在 `packages/ui/src/App.tsx` 中添加按钮
6. 在 `packages/core/__tests__` 中添加测试

## 录制 Demo GIF

推荐工具: [ScreenToGif](https://www.screentogif.com/) (Windows)

录制流程:
1. 启动应用 (`cargo tauri dev`)
2. 复制一段文本 (Ctrl+C)
3. 按 Alt+Space 打开面板
4. 点击条目进入详情
5. 点击「总结」按钮
6. 等 AI 返回结果
7. 保存为 `docs/demo.gif`

## CI/CD

CI 流程在 `.github/workflows/ci.yml`：
- 每次 push/PR 自动运行
- 安装依赖 → TypeScript 类型检查 → (可选: Rust 测试)

Release 流程 (配置后可用)：
- 打 tag `v*` 自动构建 Windows 安装包
- 发布到 GitHub Releases
