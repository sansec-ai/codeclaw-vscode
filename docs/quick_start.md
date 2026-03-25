# Quick Start Guide

Get up and running with WeChat Claude Code in under 5 minutes.

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **VSCode** | >= 1.85.0 |
| **WeChat** | iOS WeChat with ClawBot support (currently in beta) |
| **API Key** | Anthropic API key or compatible provider (e.g., OpenRouter, AWS Bedrock, custom endpoint) |

> **No Node.js required at runtime** — Claude Code CLI is bundled inside the extension.

## Step 1: Install the Extension

### Option A: From VSIX (recommended)

```bash
code --install-extension wechat-claude-vscode-0.1.77.vsix
```

Or in VSCode: `Ctrl+Shift+P` → `Extensions: Install from VSIX...` → select the file.

### Option B: From VSCode Marketplace

Open the Extensions view (`Ctrl+Shift+X`), search for **"WeChat Claude Code"**, and click **Install**.

### Option C: Build from source

```bash
git clone https://github.com/your-username/wechat-claude-vscode.git
cd wechat-claude-vscode
npm install
./build.sh
code --install-extension wechat-claude-vscode-0.1.77.vsix
```

## Step 2: Configure API Credentials

Open VSCode Settings (`Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`) and add:

### Using Anthropic directly

```jsonc
{
  "wechat-vscode.environmentVariables": [
    { "name": "ANTHROPIC_API_KEY", "value": "sk-ant-xxxxx" },
    { "name": "ANTHROPIC_MODEL", "value": "claude-sonnet-4-6" }
  ]
}
```

### Using a third-party API proxy

```jsonc
{
  "wechat-vscode.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "https://your-proxy.example.com" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "your-token-here" },
    { "name": "ANTHROPIC_MODEL", "value": "claude-sonnet-4-6" }
  ]
}
```

> **Already using the Claude Code extension?** If you have `claudeCode.environmentVariables` configured, this extension reads it automatically — no need to duplicate.

## Step 3: Open a Project

Open a project folder in VSCode. This becomes Claude's working directory.

```
File → Open Folder → /path/to/your/project
```

## Step 4: Connect WeChat

1. Click the **WeChat icon** (📱) in the VSCode Activity Bar (left sidebar)
2. Click the **"连接微信"** (Connect) button in the panel
3. A QR code will appear — scan it with **WeChat on your phone**
4. Wait for the "✅ 绑定成功" confirmation

The status bar at the bottom should now show `WeChat: ✅ 已连接`.

## Step 5: Start Chatting

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
| `/cwd /path/to/dir` | Change Claude's working directory |
| `/model claude-sonnet-4-6` | Switch Claude model |
| `/mode 2` | Switch to auto-accept file edits mode |
| `/status` | View current session info |

**Permission mode shortcuts:** `0` = plan, `1` = default, `2` = acceptEdits, `3+` = bypassPermissions

## Tips

- **Long responses**: Claude's full reply is sent as a single message (no splitting). Large outputs may take a moment.
- **Images**: Send screenshots from WeChat — Claude can analyze them.
- **Streaming**: By default, Claude's intermediate tool calls are logged to the VSCode Output Channel (`View → Output → WeChat Claude Code`). Only the final result is sent to WeChat.
- **Auto-reconnect**: If VSCode restarts, the extension automatically reconnects using saved credentials.
- **Session expiry**: If the WeChat session expires, click "重新绑定" (Rebind) in the sidebar to scan a new QR code.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| QR code expired | Click "重新绑定" to generate a new one |
| No response in WeChat | Check the Output Channel for errors; verify API credentials |
| "Claude returned an empty response" | Try `/new` to start a fresh session |
| API connection refused | Verify `ANTHROPIC_BASE_URL` is accessible from your network |
| Claude keeps asking for permissions | Use `/mode 2` to auto-accept file edits, or `/mode 3` to skip all permissions |

## Next Steps

- Read the [full README](../README.md) for all features and configuration options
- Read the [technical article](technical-article.md) to understand the architecture
- Explore slash commands with `/help` in WeChat
