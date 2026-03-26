# Code Claw：口袋里的 AI 编程助手

> 通过微信 ClawBot 远程控制 VSCode 项目中的 Claude Code

**[English](README.md)** | 中文

## 概述

一个 VSCode 扩展，通过微信官方的 **ClawBot（智能对话机器人）** 将你的个人微信变成 Claude Code 的远程控制终端。手机发消息，VSCode 里的 Claude Code 帮你写代码。

### 核心卖点

- 🏛️ **使用微信官方 ClawBot (iLink) API** — 无逆向工程，无第三方微信客户端
- 📦 **内置 Claude Code CLI** — 零外部依赖，安装即用
- 🔁 **持续会话** — Claude 在消息间保持上下文记忆
- 🔌 **兼容多种 API** — 支持 OpenRouter、AWS Bedrock、自定义端点等任何 Anthropic 兼容 API

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📱 **扫码绑定** | 在 VSCode 侧边栏 WebView 中显示二维码，微信扫描即可绑定 |
| 🔄 **后台监听** | 绑定成功后自动在后台长轮询监听微信消息 |
| 💬 **微信操控项目** | 微信中发送文字/图片，Claude Code 将处理请求并操作当前工作目录 |
| 🔁 **持续会话** | 连续对话保持上下文，Claude 记得之前的操作，发送 `/new` 开启新会话 |
| 📋 **Todolist 追踪** | Claude 使用 TodoWrite 时，自动推送任务进度到微信 |
| 🛡️ **权限拒绝检测** | 自动检测工具权限拒绝，提示用户切换 `/mode` |
| 📊 **状态栏** | VSCode 底部状态栏实时显示连接状态（未连接/连接中/已连接/处理中/错误） |
| 🗂️ **侧边栏面板** | 左侧 Activity Bar 微信图标，点击展开面板，显示二维码、状态和操作日志 |
| 📝 **斜杠命令** | 支持会话管理命令：`/help`、`/new`、`/model`、`/mode`、`/status` |
| 💾 **会话持久化** | 会话数据保存在 `~/.codeclaw-vscode/`，重启 VSCode 自动重连；断开连接保留账号，一键重连 |
| 🔄 **多项目支持** | 微信账号可在任意 VSCode 项目中使用 — 点击"重新连接"即可切换 |

## 🚀 快速开始

### 前置条件

- **VSCode** >= 1.85.0
- **个人微信账号**，支持 ClawBot 功能

### 安装扩展

#### 方式一：从 VSIX 安装（推荐）

1. 获取 `codeclaw-vscode-0.1.77.vsix` 文件
2. VSCode 中按 `Ctrl+Shift+P`（macOS: `Cmd+Shift+P`）
3. 输入 `Extensions: Install from VSIX...`
4. 选择 `.vsix` 文件
5. 重新加载 VSCode 窗口

#### 方式二：从 VSCode Marketplace（发布后）

在扩展视图中搜索 **"Code Claw"** 并点击安装。

#### 方式三：从源码安装

```bash
git clone https://github.com/sansec-ai/codeclaw-vscode.git
cd codeclaw-vscode
npm install
./build.sh
# 然后安装生成的 .vsix 文件
```

### 使用步骤

> 📖 详细的分步指南请查看 [快速开始指南](docs/quick_start_cn.md)。

1. **打开项目** — 在 VSCode 中打开一个项目文件夹（工作目录）
2. **连接微信** — 点击左侧 Activity Bar 的 Code Claw 图标，扫描二维码绑定
3. **开始使用** — 绑定成功后，在微信中发送消息即可操作项目

> 💡 **已经在使用 Claude Code？** 如果你已安装 Claude Code 并正常使用，Code Claw 会自动读取，无需任何额外配置。安装 → 扫码 → 开始用。

### 打开面板

点击 VSCode 左侧 Activity Bar 的 Code Claw 图标 |

## ⚙️ 配置说明

### 环境变量

如果你还没有使用 Claude Code，需要在 VSCode `settings.json` 中配置 API 凭证：

```jsonc
{
  "codeClaw.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "<模型 API Endpoint>" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "<your-api-token-here>" },
    { "name": "ANTHROPIC_MODEL", "value": "<模型名称>" }
  ]
}
```

### 环境变量加载优先级

```
① codeClaw.environmentVariables（本插件配置，最高优先）
     ↓ 未配置的变量回退
② claudeCode.environmentVariables（Claude Code 插件配置，兼容复用）
     ↓ 未配置的变量回退
③ 系统环境变量 process.env
```

## 💬 微信端命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 显示帮助信息 | `/help` |
| `/new` | 开启新会话（清除上下文） | `/new` |
| `/model <名称>` | 切换 Claude 模型 | `/model claude-sonnet-4-6` |
| `/mode <模式>` | 切换权限模式（名称或数字） | `/mode 2` |
| `/status` | 查看当前会话状态 | `/status` |

直接输入文字即可与 Claude Code 对话，Claude Code会操作当前 VSCode 项目目录。

### 权限模式

| 模式 | 说明 | 快捷键 |
|------|------| ------ |
| `plan` | 仅规划不执行 | `0` |
| `default` | 默认，逐次确认危险操作 | `1` |
| `acceptEdits` | 自动接受文件编辑 | `2` |
| `bypassPermissions` | 跳过所有权限检查 | `3+` |


### TodoList 追踪

当 Claude 使用 `TodoWrite` 工具时，插件自动检测 todolist 变化并推送进度到微信：

```
📋 任务进度 60%
[██████░░░░] 3/5

✅ 创建 test.txt 文件
✅ 读取 config.json
🔄 列出目录内容
⬜ 运行测试套件
⬜ 清理临时文件
```

### 权限拒绝检测

当 Claude 请求的工具权限被拒绝时（如 `default` 或 `plan` 模式），插件会在最终结果后自动追加提示：

```
⚠️ 部分操作因权限限制未执行

被拒绝的工具: Bash, Write

当前权限模式: default

如需自动授权，请发送:
  /mode 2  (自动接受文件编辑)
  /mode 3  (跳过所有权限检查)
```

## ⚠️ 注意事项

- 微信 ilink bot API 依赖网络连通性（`ilinkai.weixin.qq.com`）
- 会话过期后需要点击"重新绑定"扫描新的二维码
- **断开连接保留账号**：点击"断开连接"停止 daemon 但保留凭证，点击"重新连接"即可立即恢复
- **自由切换项目**：你的微信账号不会锁定到某个项目目录，任何项目都能直接用
- 微信不支持 Markdown 渲染，插件会自动将 Markdown 转为纯文本发送

## 📄 License

MIT

## 🙏 致谢

部分微信 ClawBot 集成代码参考了 [wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code)（MIT 协议）。
