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

# Rust 测试 (需要 MSVC 环境)
cd src-tauri && cargo test

# TypeScript 测试
npx tsx packages/core/__tests__/ai-client.test.ts
npx tsx packages/core/__tests__/action-engine.test.ts
npx tsx packages/core/__tests__/event-bus.test.ts
npx tsx packages/core/__tests__/privacy-flow.test.ts
```

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
