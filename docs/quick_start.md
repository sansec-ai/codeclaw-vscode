# Quick Start Guide

Get up and running with Code Claw in under 5 minutes.

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **VSCode** | >= 1.85.0 |
| **WeChat** | iOS WeChat with ClawBot support |

> **No Node.js required at runtime** — Claude Code CLI is bundled inside the extension.
> **Already using Claude Code?** Skip to Step 3 — Code Claw reads your existing configuration automatically.

## Step 1: Install the Extension

### Option A: From VSIX (recommended)

```bash
code --install-extension codeclaw-vscode-0.1.77.vsix
```

Or in VSCode: `Ctrl+Shift+P` → `Extensions: Install from VSIX...` → select the file.

### Option B: From VSCode Marketplace

Open the Extensions view (`Ctrl+Shift+X`), search for **"Code Claw"**, and click **Install**.

## Step 2: Open a Project

Open a project folder in VSCode. This becomes Claude's working directory.

```
File → Open Folder → /path/to/your/project
```

## Step 3: Connect WeChat

1. Click the **Code Claw icon** (![](../icon.svg)) in the VSCode Activity Bar (left sidebar)
2. Click the **"连接微信"** (Connect) button in the panel
3. A QR code will appear — scan it with **WeChat on your phone**
4. Wait for the "✅ 绑定成功" confirmation

The status bar at the bottom should now show `WeChat: ✅ 已连接`.

## Step 4: Start Chatting

Open WeChat on your phone, find the **ClawBot** conversation, and send a message:

```
你好，请介绍一下当前项目的结构
```

Claude Code will analyze your project and reply directly in WeChat.

## Useful Commands

| Command | What it does |
|---------|-------------|
| `/help` | Show all available commands |
| `/new` | Start a fresh session (clear context) |
| `/model claude-sonnet-4-6` | Switch Claude model |
| `/mode 2` | Switch to auto-accept file edits mode |
| `/mode 3` | Skip all permission checks |
| `/status` | View current session info |

**Permission mode shortcuts:** `0` = plan, `1` = default, `2` = acceptEdits, `3+` = bypassPermissions

## Tips

- **Long responses**: Claude's full reply is sent as a single message (no splitting). Large outputs may take a moment.
- **Images**: Send screenshots from WeChat — Claude can analyze them.
- **Streaming**: By default, Claude's intermediate tool calls are logged to the VSCode Output Channel (`View → Output → Code Claw`). Only the final result is sent to WeChat.
- **Checklist tracking**: When Claude uses TodoWrite, task progress is automatically pushed to your WeChat with a visual progress bar.
- **Permission denials**: If Claude says it did something but the tool was actually denied, you'll see a tip with `/mode` suggestions. Use `/mode 3` to bypass all permissions.
- **Auto-reconnect**: If VSCode restarts with an open workspace, the extension automatically reconnects using saved credentials.
- **Disconnect & Reconnect**: Click "断开连接" to stop the daemon. The account data is preserved — click "重新连接" to start the daemon again instantly, no QR scan needed.
- **Multi-project**: Your WeChat account can be used with any VSCode project. When switching projects, just click "重新连接" — the binding automatically updates.
- **Session expiry**: If the WeChat session expires, click "重新绑定" (Rebind) in the sidebar to scan a new QR code.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| QR code expired | Click "重新绑定" to generate a new one |
| No response in WeChat | Check the Output Channel for errors; verify API credentials |
| "Claude returned an empty response" | Try `/new` to start a fresh session |
| API connection refused | Verify `ANTHROPIC_BASE_URL` is accessible from your network |
| Claude keeps asking for permissions | Use `/mode 2` to auto-accept file edits, or `/mode 3` to skip all permissions |
| "Already connected to another project" | Click "重新连接" — the binding will automatically update to the current project |

## Next Steps

- Read the [full README](../README.md) for all features and configuration options
- Explore slash commands with `/help` in WeChat
