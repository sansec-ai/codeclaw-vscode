# Code Claw: AI Coding Power in Your Pocket

> Control Claude Code in your VSCode workspace from WeChat via ClawBot

## Overview

A VSCode extension that turns your personal WeChat into a remote control terminal for Claude Code — through WeChat's official **ClawBot** (iLink) API. Send a message from your phone, and Claude Code in VSCode writes code for you.

### Why Code Claw?

- 🏛️ **Uses WeChat's official ClawBot (iLink) API** — no reverse engineering, no third-party WeChat clients
- 📦 **Bundled Claude Code CLI** — zero external dependencies, install and go
- 🔁 **Persistent sessions** — Claude remembers context across messages
- 🔌 **Any Anthropic-compatible API** — works with OpenRouter, AWS Bedrock, custom endpoints

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📱 **QR Code Binding** | Display a QR code in the VSCode sidebar WebView; scan with WeChat to bind |
| 🔄 **Background Polling** | After binding, automatically long-polls for WeChat messages in the background |
| 💬 **WeChat → Claude** | Send text/images from WeChat; Claude Code processes the request in your current workspace |
| 🔁 **Continuous Sessions** | Maintains context across conversations; Claude remembers previous operations. Send `/new` to start fresh |
| 📋 **Todolist Tracking** | When Claude uses TodoWrite, task progress is automatically pushed to WeChat with a progress bar |
| 🛡️ **Permission Detection** | Automatically detects tool permission denials and prompts user to switch `/mode` |
| 📊 **Status Bar** | VSCode bottom status bar shows real-time connection state (disconnected/connecting/connected/processing/error) |
| 🗂️ **Sidebar Panel** | Code Claw icon in Activity Bar; click to expand panel with QR code, status, and operation logs |
| 📝 **Slash Commands** | Session management: `/help`, `/new`, `/model`, `/mode`, `/status` |
| 💾 **Session Persistence** | Session data saved in `~/.codeclaw-vscode/`; auto-reconnects on VSCode restart; disconnect preserves account for quick reconnect |
| 🔄 **Multi-Project Support** | WeChat account works with any VSCode project — just click "Reconnect" to switch |

## 🚀 Quick Start

### Prerequisites

- **VSCode** >= 1.85.0
- **Personal WeChat account** with ClawBot support

### Installation

#### From VSIX (recommended)

1. Get the `codeclaw-vscode-0.1.77.vsix` file
2. In VSCode, press `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`)
3. Type `Extensions: Install from VSIX...`
4. Select the `.vsix` file
5. Reload the VSCode window

#### From VSCode Marketplace (after publishing)

Search for **"Code Claw"** in the Extensions view and click Install.

#### From Source

```bash
git clone https://github.com/sansec-ai/codeclaw-vscode.git
cd codeclaw-vscode
npm install
./build.sh
# Then install the generated .vsix file
```

### Getting Started

> 📖 For a detailed step-by-step guide, see the [Quick Start Guide](docs/quick_start.md).

1. **Open a project** — Open a project folder in VSCode (this becomes your working directory)
2. **Connect WeChat** — Click the Code Claw icon in the Activity Bar (![](./icon.svg)), scan the QR code to bind
3. **Start chatting** — Send messages from WeChat to operate your project

> 💡 **Already using Claude Code?** If you already have Claude Code installed and working, Code Claw reads your configuration automatically — no extra setup needed. Just install, scan QR, and go.

### Three Ways to Open the Panel

| Method | Action |
|--------|--------|
| 🖱️ **Sidebar** | Click the Code Claw icon in the VSCode Activity Bar |
| ⌨️ **Command Palette** | `Ctrl+Shift+P` → type `WeChat` → select a command |
| 📊 **Status Bar** | Click the `WeChat: Disconnected/Connected` indicator at the bottom |

## ⚙️ Configuration

### Environment Variables

If you're not using Claude Code already, configure your API credentials in VSCode `settings.json`:

```jsonc
{
  "codeClaw.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "<Model API Endpoint>" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "<your-api-token-here>" },
    { "name": "ANTHROPIC_MODEL", "value": "<model-name>" }
  ]
}
```

### Environment Variable Loading Priority

```
① codeClaw.environmentVariables (this extension's config, highest priority)
     ↓ Variables not configured fall back to
② claudeCode.environmentVariables (Claude Code extension config, for compatibility)
     ↓ Variables not configured fall back to
③ System environment variables (process.env)
```

## 💬 Commands (Slash Commands)

| Command | Description | Example |
|---------|-------------|---------|
| `/help` | Show help information | `/help` |
| `/new` | Start a new session (clear context) | `/new` |
| `/model <name>` | Switch Claude model | `/model claude-sonnet-4-6` |
| `/mode <mode>` | Switch permission mode (name or number) | `/mode 2` |
| `/status` | View current session status | `/status` |

Type any text to chat with Claude Code — Claude will operate on your current VSCode project directory.

### Permission Modes

| Mode | Description | Shortcut |
|------|-------------|----------|
| `plan` | Plan only, no execution | `0` |
| `default` | Default — prompt for confirmation on dangerous operations | `1` |
| `acceptEdits` | Auto-accept file edits | `2` |
| `bypassPermissions` | Skip all permission checks | `3+` |

### TodoList Tracking

When Claude uses the `TodoWrite` tool during processing, the extension automatically detects todolist changes and pushes progress updates to WeChat:

```
📋 任务进度 60%
[██████░░░░] 3/5

✅ Create test.txt file
✅ Read config.json
🔄 List directory contents
⬜ Run test suite
⬜ Clean up temp files
```

### Permission Denial Detection

When Claude requests tool permissions that are denied (e.g., in `default` or `plan` mode), the extension automatically appends a tip after the final result:

```
⚠️ 部分操作因权限限制未执行

被拒绝的工具: Bash, Write

当前权限模式: default

如需自动授权，请发送:
  /mode 2  (自动接受文件编辑)
  /mode 3  (跳过所有权限检查)
```

## ⚠️ Notes

- WeChat iLink Bot API depends on network connectivity to `ilinkai.weixin.qq.com`
- Sessions expire after some time — click "重新绑定" to re-scan QR code
- **Disconnect preserves account**: clicking "断开连接" stops the daemon but keeps credentials; click "重新连接" to resume instantly
- **Switch projects freely**: your WeChat account is not locked to one project directory
- WeChat does not render Markdown — the extension automatically converts Markdown to plain text

## 📄 License

MIT

## 🙏 Acknowledgements

Part of the WeChat ClawBot integration code was inspired by [wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code) (MIT License).

---

**[中文文档](README_CN.md)**
