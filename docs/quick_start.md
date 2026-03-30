# Quick Start Guide | 快速开始指南

Get up and running with Code Claw in under 5 minutes.
5 分钟内快速上手 Code Claw。

---

## Prerequisites | 前置条件

| Requirement | 要求 | Details | 说明 |
|-------------|------|---------|------|
| **VSCode** | **VSCode** | >= 1.85.0 | |
| **WeChat** | **微信** | iOS WeChat with ClawBot support | iOS 微信，支持 ClawBot |
| **Telegram** | **Telegram** | Any Telegram account (for Telegram channel) | 任意 Telegram 账号 |

> **No Node.js required at runtime** — Claude Code CLI is bundled inside the extension.
> **运行时无需 Node.js** — Claude Code CLI 已内置。
> **Already using Claude Code?** Skip to Step 3 — Code Claw reads your existing configuration.
> **已在用 Claude Code？** 跳到第三步。

## Step 1: Install | 第一步：安装

### Option A: From VSIX (从 VSIX 安装)

```bash
code --install-extension codeclaw-vscode-0.1.79.vsix
```

Or in VSCode: `Ctrl+Shift+P` → `Extensions: Install from VSIX...` → select the file.
VSCode 中：`Ctrl+Shift+P` → `Extensions: Install from VSIX...` → 选择文件。

### Option B: From Marketplace (从市场安装)

Open Extensions view (`Ctrl+Shift+X`), search **"Code Claw"**, click Install.
打开扩展视图（`Ctrl+Shift+X`），搜索 **"Code Claw"**，点击 Install。

## Step 2: Open a Project | 第二步：打开项目

Open a project folder in VSCode. This becomes Claude's working directory.
在 VSCode 中打开项目文件夹。

## Step 3: Connect | 第三步：连接

### Option A: WeChat (微信)

1. Click the **Code Claw icon** in the Activity Bar (left sidebar) / 点击左侧 Activity Bar 的 **Code Claw 图标**
2. Click **"Connect"** / 点击 **"连接"** 按钮
3. A QR code appears — scan with WeChat / 弹出二维码 — 用手机微信扫描
4. Wait for confirmation / 等待绑定成功提示

### Option B: Telegram

1. Click the **Code Claw icon** in the Activity Bar / 点击左侧 **Code Claw 图标**
2. Click **"Switch Channel"** → select **Telegram** / 点击 **"切换渠道"** → 选择 **Telegram**
3. Enter your Bot Token (get one from **@BotFather**) / 输入 Bot Token（从 **@BotFather** 获取）
4. Wait for connection confirmation / 等待连接成功

> 💡 To create a Telegram Bot: open @BotFather in Telegram, send `/newbot`, follow the prompts, and copy the token.
> 💡 创建 Telegram Bot：在 Telegram 中打开 @BotFather，发送 `/newbot`，按提示操作，复制 Token。

## Step 4: Start Chatting | 第四步：开始使用

Send a message from WeChat or Telegram:
在微信或 Telegram 中发送消息：

```
Introduce the project structure / 介绍一下当前项目的结构
```

Claude Code will analyze your project and reply directly in your IM app.
Claude Code 会分析项目并直接在 IM 中回复。

## Useful Commands | 常用命令

| Command | What it does | 功能 |
|---------|-------------|------|
| `/help` | Show all commands | 显示帮助 |
| `/new` | Start fresh session | 开启新会话 |
| `/model <name>` | Switch model | 切换模型 |
| `/mode 0-3` | Switch permission mode | 切换权限模式 |
| `/status` | View session info | 查看状态 |

## Tips | 使用技巧

- **Long responses** / **长回复**: Full reply sent as one message / 完整回复作为一条消息发送
- **Images** / **图片**: Send screenshots — Claude can analyze them / 发送截图让 Claude 分析
- **Streaming** / **流式输出**: Intermediate calls logged to VSCode Output / 中间过程记录到 VSCode 输出通道
- **Auto-reconnect** / **自动重连**: VSCode restart auto-reconnects / VSCode 重启后自动重连
- **Disconnect & Reconnect** / **断开与重连**: Click "Disconnect" stops daemon, "Reconnect" resumes instantly / "断开连接"停止，"重新连接"立即恢复
- **Multi-project** / **多项目**: Account works with any project / 账号可在任意项目中使用
- **Channel switching** / **渠道切换**: Click "Switch Channel" to change between WeChat and Telegram / 点击"切换渠道"切换微信和 Telegram

## Troubleshooting | 常见问题

| Problem / 问题 | Solution / 解决方案 |
|----------------|-------------------|
| QR code expired / 二维码过期 | Click "Switch Channel" to regenerate / 点击"切换渠道"重新生成 |
| Telegram "Unauthorized" / Telegram Token 无效 | Check your Bot Token / 检查 Bot Token 是否正确 |
| No response / 无响应 | Check VSCode Output Channel for errors / 查看 VSCode 输出通道的错误日志 |
| "Empty response" / "无返回内容" | Try `/new` for a fresh session / 发送 `/new` 开启新会话 |
| API connection refused / API 连接失败 | Verify `ANTHROPIC_BASE_URL` is accessible / 确认 `ANTHROPIC_BASE_URL` 可访问 |
| Permission denied / 权限被拒绝 | Use `/mode 2` or `/mode 3` / 发送 `/mode 2` 或 `/mode 3` |
| "Already connected" / "已连接" | Click "Reconnect" / 点击"重新连接" |

## Next Steps | 下一步

- Read the [full README](../README.md) for all features / 阅读 [README](../README.md) 了解所有功能
- Explore slash commands with `/help` in WeChat/Telegram / 在 IM 中发送 `/help` 查看所有命令
