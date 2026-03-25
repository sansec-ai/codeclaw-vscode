# WeChat Claude Code

> Control Claude Code in your VSCode workspace from WeChat via ClawBot

## Overview

A VSCode extension that turns your personal WeChat into a remote control terminal for Claude Code — through WeChat's official **ClawBot** (iLink) API. Send a message from your phone, and Claude Code in VSCode writes code for you.

### Why WeChat Claude Code?

- 🏛️ **Uses WeChat's official ClawBot (iLink) API** — no reverse engineering, no third-party WeChat clients
- 📦 **Bundled Claude Code CLI** — zero external dependencies, install and go
- 🔁 **Persistent sessions** — Claude remembers context across messages
- ⚡ **Streaming support** — watch Claude's tool calls in real-time from your phone
- 🔌 **Any Anthropic-compatible API** — works with OpenRouter, AWS Bedrock, custom endpoints

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📱 **QR Code Binding** | Display a QR code in the VSCode sidebar WebView; scan with WeChat to bind |
| 🔄 **Background Polling** | After binding, automatically long-polls for WeChat messages in the background |
| 💬 **WeChat → Claude** | Send text/images from WeChat; Claude Code processes the request in your current workspace |
| 🔁 **Continuous Sessions** | Maintains context across conversations; Claude remembers previous operations. Send `/new` to start fresh |
| ⚡ **Streaming Output** | Tool calls and intermediate results pushed to WeChat in real-time (toggleable) |
| 📊 **Status Bar** | VSCode bottom status bar shows real-time connection state (disconnected/connecting/connected/processing/error) |
| 🗂️ **Sidebar Panel** | WeChat icon in Activity Bar; click to expand panel with QR code, status, and operation logs |
| 📝 **Slash Commands** | Session management: `/help`, `/new`, `/cwd`, `/model`, `/mode`, `/status` |
| 💾 **Session Persistence** | Session data saved in `~/.wechat-claude-code/`; auto-reconnects on VSCode restart |
| 📦 **Zero External Dependencies** | Claude Code CLI bundled inside the extension — no separate installation needed |

## 🚀 Quick Start

### Prerequisites

- **VSCode** >= 1.85.0
- **Personal WeChat account** with ClawBot support (iOS WeChat, currently in beta)
- **Anthropic API key** (or compatible provider)

### Installation

#### From VSIX (recommended)

1. Get the `wechat-claude-vscode-0.1.77.vsix` file
2. In VSCode, press `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`)
3. Type `Extensions: Install from VSIX...`
4. Select the `.vsix` file
5. Reload the VSCode window

#### From VSCode Marketplace (after publishing)

Search for **"WeChat Claude Code"** in the Extensions view and click Install.

#### From Source

```bash
git clone https://gitee.com/jiadx1/wechat-vscode.git
cd wechat-vscode
npm install
./build.sh
# Then install the generated .vsix file
```

### Getting Started

> 📖 For a detailed step-by-step guide, see the [Quick Start Guide](docs/quick_start.md).

1. **Open a project** — Open a project folder in VSCode (this becomes your working directory)
2. **Configure API credentials** — Set up your API key in VSCode Settings (see Configuration below)
3. **Click the WeChat icon** — In the Activity Bar (left sidebar), click the WeChat icon
4. **Scan QR code** — Use WeChat to scan the QR code displayed in the panel
5. **Send messages** — Start chatting with Claude Code from WeChat!

### Three Ways to Open the Panel

| Method | Action |
|--------|--------|
| 🖱️ **Sidebar** | Click the WeChat icon in the VSCode Activity Bar |
| ⌨️ **Command Palette** | `Ctrl+Shift+P` → type `WeChat` → select a command |
| 📊 **Status Bar** | Click the `WeChat: Disconnected/Connected` indicator at the bottom |

## ⚙️ Configuration

### Settings Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `wechat-vscode.logLevel` | enum | `INFO` | Extension log level: `DEBUG` / `INFO` / `WARN` / `ERROR` |
| `wechat-vscode.streaming` | boolean | `true` | Push Claude Code intermediate output to WeChat in real-time |
| `wechat-vscode.environmentVariables` | array | `[]` | Environment variables passed to the Claude Code CLI |

Configure in VSCode `settings.json`:

```jsonc
{
  // Log level (DEBUG / INFO / WARN / ERROR)
  "wechat-vscode.logLevel": "INFO",

  // Streaming: true = real-time intermediate output to WeChat, false = final result only
  "wechat-vscode.streaming": true,

  // Claude Code API configuration
  "wechat-vscode.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "https://api.anthropic.com" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "your-api-key-here" },
    { "name": "ANTHROPIC_MODEL", "value": "claude-sonnet-4-6" }
  ]
}
```

### Environment Variable Loading Priority

```
① wechat-vscode.environmentVariables (this extension's config, highest priority)
     ↓ Variables not configured fall back to
② claudeCode.environmentVariables (Claude Code extension config, for compatibility)
     ↓ Variables not configured fall back to
③ System environment variables (process.env)
```

> **Zero-config compatibility**: If you already have the Claude Code extension with `claudeCode.environmentVariables` configured, this extension reads it automatically — no need to duplicate settings.

## 💬 Commands (Slash Commands)

| Command | Description | Example |
|---------|-------------|---------|
| `/help` | Show help information | `/help` |
| `/new` | Start a new session (clear context) | `/new` |
| `/cwd <path>` | Change working directory | `/cwd /home/user/project` |
| `/model <name>` | Switch Claude model | `/model claude-sonnet-4-6` |
| `/mode <mode>` | Switch permission mode | `/mode acceptEdits` |
| `/status` | View current session status | `/status` |

Type any text to chat with Claude Code — Claude will operate on your current VSCode project directory.

### Permission Modes

| Mode | Description |
|------|-------------|
| `plan` | Plan only, no execution |
| `default` | Default — prompt for confirmation on dangerous operations |
| `acceptEdits` | Auto-accept file edits |
| `bypassPermissions` | Skip all permission checks |

**Number shortcuts for `/mode`:**

| Shortcut | Mode |
|----------|------|
| `0` | `plan` |
| `1` | `default` |
| `2` | `acceptEdits` |
| `3+` | `bypassPermissions` |

## ⚡ Streaming Output

When `wechat-vscode.streaming` is enabled (default), Claude Code's intermediate output is pushed to WeChat in real-time:

```
Example message flow (streaming=true):

You: Help me create a hello world app

🔧 Write
  {"path":"hello.js","content":"console.log('Hello World')"}

✅ File created successfully

Created hello.js for you with the following content:
  console.log('Hello World')

Run it with: node hello.js
```

Tool calls are prefixed with 🔧, tool results with ✅/❌, and text replies are automatically converted from Markdown to WeChat-friendly plain text.

When streaming is disabled, WeChat only receives Claude's final reply text.

## 🏗️ How It Works

```
┌─────────────┐     iLink Bot API       ┌────────────────────────────┐
│  WeChat      │ ◄────────────────────► │      VSCode Extension      │
│  (Phone)     │     Long-poll + Send    │                            │
└─────────────┘                        │  ┌──────────────────────┐  │
                                       │  │ Claude Agent SDK      │  │
                                       │  │  (bundled, no install)│  │
                                       │  └──────────┬───────────┘  │
                                       │             │ spawn        │
                                       │  ┌──────────▼───────────┐  │
                                       │  │ claude-code/cli.js    │  │
                                       │  │ (bundled, operates    │  │
                                       │  │  on workspace dir)    │  │
                                       │  └──────────────────────┘  │
                                       └────────────────────────────┘
```

1. **QR Binding** — Calls the WeChat iLink Bot API to generate a QR code; user scans to obtain a bot token
2. **Message Polling** — Background long-polling receives WeChat messages, with deduplication and auto-reconnect
3. **Claude Processing** — Invokes the bundled Claude Code CLI via `@anthropic-ai/claude-agent-sdk`, supporting continuous sessions (resume)
4. **Streaming Output** — When enabled, tool calls and intermediate results are pushed to WeChat in real-time
5. **Result Reply** — Claude's response is formatted as WeChat-friendly plain text and sent back

### Bundled Claude Code CLI

The extension bundles the Claude Code CLI (`cli.js` from `@anthropic-ai/claude-agent-sdk`) inside the `.vsix`. No separate installation is needed. The CLI version stays in sync with the SDK (currently 0.1.77).

## Architecture

```
WeChat (Phone)  ←→  iLink Bot API  ←→  VSCode Extension  ←→  Claude Agent SDK (bundled)
```

- **Extension Entry** (`extension.ts`): `activate`/`deactivate`, command registration, message routing
- **Daemon** (`monitor.ts`): Long-poll loop with deduplication and backoff
- **Message Handler** (`extension.ts`): Dispatches user messages to Claude or slash command handlers
- **Claude Provider** (`claude/provider.ts`): Wraps `@anthropic-ai/claude-agent-sdk` with streaming support
- **WeChat Sender** (`wechat/send.ts`): Sends formatted replies back to WeChat

## 📂 Project Structure

```
wechat-vscode/
├── package.json              # VSCode extension manifest (commands, sidebar, menus, settings)
├── tsconfig.json             # TypeScript config (CommonJS)
├── icon.svg                  # Activity Bar icon
├── build.sh                  # One-click build script (env check → compile → package → VSIX)
├── .vscodeignore             # VSIX packaging exclusion rules
├── README.md
├── src/
│   ├── extension.ts          # Extension entry (activate/deactivate, command registration, message handling)
│   ├── panel.ts              # WebView Panel + sidebar WebviewViewProvider
│   ├── statusbar.ts          # Bottom status bar management
│   ├── logger.ts             # Logging (DEBUG/INFO/WARN/ERROR level filtering)
│   ├── session.ts            # Session persistence (~/.wechat-claude-code/sessions/)
│   ├── config.ts             # Configuration management
│   ├── permission.ts         # Permission approval management
│   ├── store.ts              # JSON file read/write utilities
│   ├── constants.ts          # Constants
│   ├── wechat/               # WeChat communication module
│   │   ├── api.ts            # WeChat iLink Bot API wrapper
│   │   ├── login.ts          # QR code login
│   │   ├── monitor.ts        # Message long-poll monitor (dedup + auto-reconnect)
│   │   ├── send.ts           # Message sending
│   │   ├── accounts.ts       # Account credential management
│   │   ├── types.ts          # Protocol type definitions
│   │   ├── media.ts          # Image/text message parsing
│   │   ├── cdn.ts            # WeChat CDN media download
│   │   ├── crypto.ts         # AES encryption/decryption
│   │   └── sync-buf.ts       # Message polling sync buffer
│   └── claude/
│       └── provider.ts       # Claude Agent SDK integration (streaming, Markdown → plain text)
└── out/
    ├── extension.js          # Compiled extension code (esbuild bundle)
    └── claude-code/
        └── cli.js            # Bundled Claude Code CLI (~11MB)
```

## 🔧 Development

### Local Development

```bash
git clone https://gitee.com/jiadx1/wechat-vscode.git
cd wechat-vscode
npm install
npm run watch          # Watch mode compilation
# Press F5 in VSCode to launch Extension Development Host for debugging
```

### Key Commands

```bash
npm run compile        # Compile TypeScript
npm run esbuild        # esbuild dev build (with sourcemaps)
npm run watch          # Watch mode compilation
npm run package        # Generate .vsix
./build.sh             # One-click build (recommended, includes full checks)
```

## 📦 Build & Deploy

```bash
./build.sh
# Generates wechat-vscode-0.1.77.vsix
```

The script automatically runs: env check → clean old artifacts → install deps → file check → TypeScript type check → esbuild bundle → copy Claude Code CLI → verify → generate VSIX.

Install:
```bash
code --install-extension wechat-vscode-0.1.77.vsix
# Or via VSCode Command Palette: Ctrl+Shift+P → Extensions: Install from VSIX...
```

Uninstall:
```bash
code --uninstall-extension SansecAiLab.wechat-claude-vscode
```

## 📂 Data Directory

```
~/.wechat-claude-code/
├── accounts/       # WeChat account credentials (bot token, etc.)
├── sessions/       # Session data (SDK session ID, working directory, model settings)
└── get_updates_buf # Message polling sync buffer
```

## ⚠️ Notes

- Requires an Anthropic API key (`ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`)
- Supports custom API endpoints (`ANTHROPIC_BASE_URL`) for third-party API proxies
- WeChat iLink Bot API depends on network connectivity to `ilinkai.weixin.qq.com`
- Sessions expire after some time — re-scan QR code to rebind
- WeChat does not render Markdown — the extension automatically converts Markdown to plain text

## 📄 License

MIT

---

**[中文文档](README_CN.md)**
