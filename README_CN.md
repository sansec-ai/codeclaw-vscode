# WeChat Claude Code：口袋里的 AI 编程助手

> 通过微信 ClawBot 远程控制 VSCode 项目中的 Claude Code

**[English](README.md)** | 中文

## 概述

一个 VSCode 扩展，通过微信官方的 **ClawBot（智能对话机器人）** 将你的个人微信变成 Claude Code 的远程控制终端。手机发消息，VSCode 里的 Claude Code 帮你写代码。

### 核心卖点

- 🏛️ **使用微信官方 ClawBot (iLink) API** — 无逆向工程，无第三方微信客户端
- 📦 **内置 Claude Code CLI** — 零外部依赖，安装即用
- 🔁 **持续会话** — Claude 在消息间保持上下文记忆
- ⚡ **流式输出** — 从手机实时观看 Claude 的工具调用过程
- 🔌 **兼容多种 API** — 支持 OpenRouter、AWS Bedrock、自定义端点等任何 Anthropic 兼容 API

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📱 **扫码绑定** | 在 VSCode 侧边栏 WebView 中显示二维码，微信扫描即可绑定 |
| 🔄 **后台监听** | 绑定成功后自动在后台长轮询监听微信消息 |
| 💬 **微信操控项目** | 微信中发送文字/图片，Claude Code 将处理请求并操作当前工作目录 |
| 🔁 **持续会话** | 连续对话保持上下文，Claude 记得之前的操作，发送 `/new` 开启新会话 |
| ⚡ **流式输出** | 工具调用、中间过程实时推送到微信（可关闭） |
| 📋 **Checklist 追踪** | Claude 使用 TodoWrite 时，自动推送任务进度到微信 |
| 🛡️ **权限拒绝检测** | 自动检测工具权限拒绝，提示用户切换 `/mode` |
| 📊 **状态栏** | VSCode 底部状态栏实时显示连接状态（未连接/连接中/已连接/处理中/错误） |
| 🗂️ **侧边栏面板** | 左侧 Activity Bar 微信图标，点击展开面板，显示二维码、状态和操作日志 |
| 📝 **斜杠命令** | 支持会话管理命令：`/help`、`/new`、`/cwd`、`/model`、`/mode`、`/status` |
| 💾 **会话持久化** | 会话数据保存在 `~/.wechat-claude-code/`，重启 VSCode 自动重连 |
| 📦 **零外部依赖** | Claude Code CLI 内置打包，无需系统安装，开箱即用 |

## 🚀 快速开始

### 前置条件

- **VSCode** >= 1.85.0
- **个人微信账号**，支持 ClawBot 功能（iOS 微信，目前为内测阶段）
- **Anthropic API 密钥**（或兼容的 API 提供商）

### 安装扩展

#### 方式一：从 VSIX 安装（推荐）

1. 获取 `wechat-claude-vscode-0.1.77.vsix` 文件
2. VSCode 中按 `Ctrl+Shift+P`（macOS: `Cmd+Shift+P`）
3. 输入 `Extensions: Install from VSIX...`
4. 选择 `.vsix` 文件
5. 重新加载 VSCode 窗口

#### 方式二：从 VSCode Marketplace（发布后）

在扩展视图中搜索 **"WeChat Claude Code"** 并点击安装。

#### 方式三：从源码安装

```bash
git clone https://github.com/your-username/wechat-claude-vscode.git
cd wechat-claude-vscode
npm install
./build.sh
# 然后安装生成的 .vsix 文件
```

### 使用步骤

> 📖 详细的分步指南请查看 [快速开始指南](docs/quick_start_cn.md)。

1. **打开项目** — 在 VSCode 中打开一个项目文件夹（工作目录）
2. **配置环境变量** — 在 VSCode Settings 中配置 Claude Code 的 API 地址和密钥（见下方配置说明）
3. **连接微信** — 点击左侧 Activity Bar 的微信图标，扫描二维码绑定
4. **开始使用** — 绑定成功后，在微信中发送消息即可操作项目

### 打开面板的三种方式

| 方式 | 操作 |
|------|------|
| 🖱️ **侧边栏** | 点击 VSCode 左侧 Activity Bar 的微信图标 |
| ⌨️ **命令面板** | `Ctrl+Shift+P` → 输入 `WeChat` → 选择命令 |
| 📊 **状态栏** | 点击底部状态栏的 `WeChat: 未连接/已连接` |

## ⚙️ 配置说明

### 完整配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `wechat-vscode.logLevel` | enum | `INFO` | 插件日志级别：`DEBUG` / `INFO` / `WARN` / `ERROR` |
| `wechat-vscode.streaming` | boolean | `true` | 是否将 Claude Code 中间过程实时发送到微信 |
| `wechat-vscode.environmentVariables` | array | `[]` | 传递给 Claude Code CLI 的环境变量 |

在 VSCode `settings.json` 中配置：

```jsonc
{
  // 日志级别（DEBUG / INFO / WARN / ERROR）
  "wechat-vscode.logLevel": "INFO",

  // 流式输出：true=中间过程实时推送微信，false=仅发送最终结果
  "wechat-vscode.streaming": true,

  // Claude Code API 配置
  "wechat-vscode.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "https://open.bigmodel.cn/api/anthropic" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "your-api-token-here" },
    { "name": "ANTHROPIC_MODEL", "value": "claude-sonnet-4-6" }
  ]
}
```

### 环境变量加载优先级

```
① wechat-vscode.environmentVariables（本插件配置，最高优先）
     ↓ 未配置的变量回退
② claudeCode.environmentVariables（Claude Code 插件配置，兼容复用）
     ↓ 未配置的变量回退
③ 系统环境变量 process.env
```

> **零配置兼容**：如果已安装 Claude Code 插件并配置了 `claudeCode.environmentVariables`，本插件自动读取，无需重复配置。

## 💬 微信端命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 显示帮助信息 | `/help` |
| `/new` | 开启新会话（清除上下文） | `/new` |
| `/cwd <路径>` | 切换工作目录 | `/cwd /home/user/project` |
| `/model <名称>` | 切换 Claude 模型 | `/model claude-sonnet-4-6` |
| `/mode <模式>` | 切换权限模式（名称或数字） | `/mode 2` |
| `/stream` | 切换流式/非流式输出 | `/stream` |
| `/status` | 查看当前会话状态 | `/status` |

直接输入文字即可与 Claude Code 对话，Claude 会操作当前 VSCode 项目目录。

### 权限模式

| 模式 | 说明 |
|------|------|
| `plan` | 仅规划不执行 |
| `default` | 默认，逐次确认危险操作 |
| `acceptEdits` | 自动接受文件编辑 |
| `bypassPermissions` | 跳过所有权限检查 |

**`/mode` 数字快捷键：**

| 快捷键 | 模式 |
|--------|------|
| `0` | `plan` |
| `1` | `default` |
| `2` | `acceptEdits` |
| `3+` | `bypassPermissions` |

## ⚡ 流式输出

默认开启流式输出时，Claude Code 的中间工具调用记录在 VSCode 输出通道中（`查看 → 输出 → WeChat Claude Code`），只有**最终结果**作为一条消息发送到微信。

### Checklist 追踪

当 Claude 使用 `TodoWrite` 工具时，插件自动检测 checklist 变化并推送进度到微信：

```
📋 任务进度 60%
[██████░░░░] 3/5

✅ 创建 test.txt 文件
✅ 读取 config.json
🔄 列出目录内容
⬜ 运行测试套件
⬜ 清理临时文件
```

- 更新**自动批量合并**，不超过微信每轮 ~10 条消息限制
- 最多发送 **9 条进度更新**，始终**预留第 10 条**给最终结果
- 全部完成时（100%）一定会推送最终状态
- 支持任何使用 TodoWrite 工具的模型

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

## 🏗️ 工作原理

```
┌─────────────┐     ilink bot API      ┌────────────────────────────┐
│  微信（手机） │ ◄────────────────────► │      VSCode 扩展后台        │
│  发送消息     │     长轮询 + 发送      │                            │
└─────────────┘                        │  ┌──────────────────────┐  │
                                       │  │ Claude Agent SDK      │  │
                                       │  │  (内置打包，无需安装)  │  │
                                       │  └──────────┬───────────┘  │
                                       │             │ spawn        │
                                       │  ┌──────────▼───────────┐  │
                                       │  │ claude-code/cli.js    │  │
                                       │  │ (内置，操作工作目录)   │  │
                                       │  └──────────────────────┘  │
                                       └────────────────────────────┘
```

1. **扫码绑定** — 调用微信 ilink bot API 生成二维码，用户扫码后获取 bot token
2. **消息监听** — 后台长轮询接收微信消息，支持去重和断线重连
3. **Claude 处理** — 通过 `@anthropic-ai/claude-agent-sdk` 调用内置的 Claude Code CLI，支持连续会话（resume session）
4. **流式输出** — 开启 streaming 后，工具调用和中间过程实时推送到微信
5. **结果回复** — 将 Claude 的回复格式化为微信友好的纯文本后发送回微信

### 内置 Claude Code CLI

插件将 Claude Code CLI（`@anthropic-ai/claude-agent-sdk` 的 `cli.js`）打包在 `.vsix` 内，无需用户单独安装。版本与 SDK 保持同步（当前 0.1.77）。

## 架构

```
微信（手机）  ←→  iLink Bot API  ←→  VSCode 扩展  ←→  Claude Agent SDK（内置）
```

- **扩展入口** (`extension.ts`)：`activate`/`deactivate`、命令注册、消息路由
- **守护进程** (`monitor.ts`)：长轮询循环，含消息去重和退避重连
- **消息处理器** (`extension.ts`)：将用户消息分发到 Claude 或斜杠命令处理器
- **Claude 提供者** (`claude/provider.ts`)：封装 `@anthropic-ai/claude-agent-sdk`，支持流式输出
- **微信发送器** (`wechat/send.ts`)：将格式化后的回复发送回微信

## 📂 项目结构

```
wechat-claude-vscode/
├── package.json              # VSCode 扩展清单（命令、侧边栏、菜单、配置项）
├── tsconfig.json             # TypeScript 编译配置（CommonJS）
├── icon.svg                  # 侧边栏 Activity Bar 图标
├── build.sh                  # 一键打包脚本（环境检查→编译→打包→生成 VSIX）
├── .vscodeignore             # VSIX 打包排除规则
├── README.md                 # 英文文档
├── README_CN.md              # 中文文档
├── docs/
│   └── technical-article.md  # 技术文章
├── src/
│   ├── extension.ts          # 扩展入口（activate/deactivate、命令注册、消息处理）
│   ├── panel.ts              # WebView Panel + 侧边栏 WebviewViewProvider
│   ├── statusbar.ts          # 底部状态栏管理
│   ├── logger.ts             # 日志（支持 DEBUG/INFO/WARN/ERROR 级别过滤）
│   ├── session.ts            # 会话持久化（~/.wechat-claude-code/sessions/）
│   ├── config.ts             # 配置管理
│   ├── permission.ts         # 权限审批管理
│   ├── store.ts              # JSON 文件读写工具
│   ├── constants.ts          # 常量定义
│   ├── wechat/               # 微信通信模块
│   │   ├── api.ts            # 微信 ilink bot API 封装
│   │   ├── login.ts          # 二维码登录
│   │   ├── monitor.ts        # 消息长轮询监听（去重 + 断线重连）
│   │   ├── send.ts           # 消息发送
│   │   ├── accounts.ts       # 账号凭证管理
│   │   ├── types.ts          # 协议类型定义
│   │   ├── media.ts          # 图片/文本消息解析
│   │   ├── cdn.ts            # 微信 CDN 媒体下载
│   │   ├── crypto.ts         # AES 加密解密
│   │   └── sync-buf.ts       # 消息同步缓冲
│   └── claude/
│       └── provider.ts       # Claude Agent SDK 调用（流式输出、Markdown 转纯文本）
└── out/
    ├── extension.js          # 编译后的扩展代码（esbuild bundle）
    └── claude-code/
        └── cli.js            # 内置 Claude Code CLI（~11MB）
```

## 🔧 开发指南

### 本地开发

```bash
git clone https://github.com/your-username/wechat-claude-vscode.git
cd wechat-claude-vscode
npm install
npm run watch          # 监听模式编译
# 在 VSCode 中按 F5 启动 Extension Development Host 调试
```

### 关键命令

```bash
npm run compile        # 编译 TypeScript
npm run esbuild        # esbuild 开发模式打包（带 sourcemap）
npm run watch          # 监听模式编译
npm run test:fast      # 只跑 mock 单元测试（快速）
npm test               # 跑全部测试（含真实 SDK 集成测试）
npm run package        # 生成 .vsix
./build.sh             # 一键打包（推荐，含完整检查流程）
./build.sh --with-stats # 打包并启用日志统计
```

## 📦 打包部署

### 标准打包（不含日志统计）

```bash
./build.sh
# 生成 wechat-claude-vscode-0.1.77.vsix
```

### 打包并启用日志统计

```bash
./build.sh --with-stats
# 从 .env 读取 STATS_URL 并烘焙到插件中
```

脚本自动执行：环境检查 → 清理旧产物 → 安装依赖 → 文件检查 → TypeScript 类型检查 → 生成 stats 配置 → esbuild 打包 → 复制 Claude Code CLI → 验证 → 生成 VSIX。

安装：
```bash
code --install-extension wechat-claude-vscode-0.1.77.vsix
# 或 VSCode 命令面板：Ctrl+Shift+P → Extensions: Install from VSIX...
```

卸载：
```bash
code --uninstall-extension SansecAiLab.wechat-claude-vscode
```

## 📂 数据目录

```
~/.wechat-claude-code/
├── accounts/       # 微信账号凭证（bot token 等）
├── sessions/       # 会话数据（SDK session ID、工作目录、模型设置）
└── get_updates_buf # 消息轮询同步缓冲
```

## ⚠️ 注意事项

- 需要配置 Anthropic API 密钥（`ANTHROPIC_AUTH_TOKEN` 或 `ANTHROPIC_API_KEY`）
- 支持自定义 API 地址（`ANTHROPIC_BASE_URL`），兼容第三方 API 代理
- 微信 ilink bot API 依赖网络连通性（`ilinkai.weixin.qq.com`）
- 会话过期后需要重新扫码绑定
- 微信不支持 Markdown 渲染，插件会自动将 Markdown 转为纯文本发送

## 📄 License

MIT
