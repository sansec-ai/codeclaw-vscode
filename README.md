# WeChat Claude Code — VSCode 扩展

通过微信远程控制 VSCode 项目，使用 Claude Code 处理微信消息，实现手机端操作代码。

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📱 **扫码绑定** | 在 VSCode 侧边栏 WebView 中显示二维码，微信扫描即可绑定 |
| 🔄 **后台监听** | 绑定成功后自动在后台长轮询监听微信消息 |
| 💬 **微信操控项目** | 微信中发送文字/图片，Claude Code 将处理请求并操作当前工作目录 |
| 📊 **状态栏** | VSCode 底部状态栏实时显示连接状态（未连接/连接中/已连接/处理中/错误） |
| 🗂️ **侧边栏面板** | 左侧 Activity Bar 微信图标，点击展开面板，显示二维码、状态和操作日志 |
| 📝 **斜杠命令** | 支持会话管理命令：`/help`、`/clear`、`/cwd`、`/model`、`/status` |
| 💾 **会话持久化** | 会话数据保存在 `~/.wechat-claude-code/`，重启 VSCode 自动重连 |
| 🔁 **自动重连** | 已绑定账号时，打开项目自动恢复连接 |

## 🚀 快速开始

### 前置条件

- **VSCode** >= 1.85.0
- **Node.js** >= 18
- **Claude Code** CLI 已安装并配置（[安装文档](https://docs.anthropic.com/en/docs/claude-code)）
- 个人微信账号

### 安装扩展

#### 方式一：从 VSIX 安装（推荐）

1. 获取 `wechat-vscode-0.1.0.vsix` 文件
2. VSCode 中按 `Ctrl+Shift+P`（macOS: `Cmd+Shift+P`）
3. 输入 `Extensions: Install from VSIX...`
4. 选择 `.vsix` 文件
5. 重新加载 VSCode 窗口

#### 方式二：从源码安装

```bash
git clone https://gitee.com/jiadx1/wechat-vscode.git
cd wechat-vscode
npm install
./build.sh
# 然后安装生成的 .vsix 文件
```

### 使用步骤

1. **打开项目** — 在 VSCode 中打开一个项目文件夹（工作目录）
2. **配置环境变量** — 在 VSCode Settings 中配置 Claude Code 的 API 地址和密钥（见下方配置说明）
3. **打开面板** — 点击左侧 Activity Bar 的微信图标，或按 `Ctrl+Shift+P` → `WeChat: 连接微信`
4. **扫码绑定** — 在侧边栏面板中扫描二维码绑定微信
5. **开始使用** — 绑定成功后，在微信中发送消息即可操作项目

### 打开面板的三种方式

| 方式 | 操作 |
|------|------|
| 🖱️ **侧边栏** | 点击 VSCode 左侧 Activity Bar 的微信图标 |
| ⌨️ **命令面板** | `Ctrl+Shift+P` → 输入 `WeChat` → 选择命令 |
| 📊 **状态栏** | 点击底部状态栏的 `WeChat: 未连接/已连接` |

## ⚙️ 配置说明

Claude Code CLI 调用时需要提供 API 地址和认证信息。插件使用与 Claude Code 插件**完全相同**的 `environmentVariables` 数组格式，配置了哪些变量就加载哪些。

### 加载优先级（高 → 低）

```
① wechat-vscode.environmentVariables（本插件配置）
     ↓ 未配置的变量回退
② claudeCode.environmentVariables（Claude Code 插件配置，兼容复用）
     ↓ 未配置的变量回退
③ 系统环境变量 process.env
```

> **零配置兼容**：如果已安装 Claude Code 插件并配置了 `claudeCode.environmentVariables`，本插件自动读取，无需重复配置。

### 方式一：本插件独立配置

在 VSCode `settings.json` 中添加：

```jsonc
{
  "wechat-vscode.environmentVariables": [
    {
      "name": "ANTHROPIC_BASE_URL",
      "value": "https://open.bigmodel.cn/api/anthropic"
    },
    {
      "name": "ANTHROPIC_AUTH_TOKEN",
      "value": "your-api-token-here"
    },
    {
      "name": "ANTHROPIC_MODEL",
      "value": "claude-sonnet-4-6"
    }
  ]
}
```

变量名直接使用环境变量原名（如 `ANTHROPIC_BASE_URL`），不需要转换。配了哪些就加载哪些。

### 方式二：复用 Claude Code 插件配置（零配置）

如果已安装 Claude Code 插件，直接使用它的配置：

```jsonc
{
  "claudeCode.environmentVariables": [
    {
      "name": "ANTHROPIC_BASE_URL",
      "value": "https://open.bigmodel.cn/api/anthropic"
    },
    {
      "name": "ANTHROPIC_AUTH_TOKEN",
      "value": "your-api-token-here"
    }
  ]
}
```

> **混合使用**：可以同时配置两处。`wechat-vscode.environmentVariables` 中配了的变量优先级更高，覆盖 `claudeCode.environmentVariables` 中的同名变量；未配置的变量自动从 `claudeCode.environmentVariables` 回退。

### 自定义 Claude CLI 路径

如果 `claude` 不在默认 PATH 中，可以指定完整路径：

```jsonc
{
  "wechat-vscode.claudeCommand": "/usr/local/bin/claude"
}
```

## 💬 微信端命令

在微信中发送以下命令进行会话管理：

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 显示帮助信息 | `/help` |
| `/clear` | 清除当前会话，重新开始 | `/clear` |
| `/cwd <路径>` | 切换 Claude Code 工作目录 | `/cwd /home/user/project` |
| `/model <名称>` | 切换 Claude 模型 | `/model claude-sonnet-4-6` |
| `/status` | 查看当前会话状态 | `/status` |

直接输入文字即可与 Claude Code 对话，Claude 会操作当前 VSCode 项目目录。

## 🔧 开发指南

### 项目结构

```
wechat-vscode/
├── package.json              # VSCode 扩展清单（命令、侧边栏、菜单、配置项）
├── tsconfig.json             # TypeScript 编译配置（CommonJS）
├── icon.svg                  # 侧边栏 Activity Bar 图标
├── build.sh                  # 一键打包脚本（环境检查→编译→打包）
├── .vscodeignore             # VSIX 打包排除规则
├── README.md
├── src/
│   ├── extension.ts          # 扩展入口（activate/deactivate、命令注册）
│   ├── panel.ts              # WebView Panel + 侧边栏 WebviewViewProvider
│   ├── statusbar.ts          # 底部状态栏管理
│   ├── logger.ts             # VSCode OutputChannel 日志
│   ├── session.ts            # 会话持久化（~/.wechat-claude-code/sessions/）
│   ├── config.ts             # 配置管理（~/.wechat-claude-code/config.env）
│   ├── permission.ts         # 权限审批管理
│   ├── store.ts              # JSON 文件读写工具
│   ├── constants.ts          # 常量定义
│   ├── wechat/               # 微信通信模块（复用自 wechat-claude-code）
│   │   ├── api.ts            # 微信 ilink bot API 封装
│   │   ├── login.ts          # 二维码登录（生成二维码 + 轮询扫码状态）
│   │   ├── monitor.ts        # 消息长轮询监听（带去重和断线重连）
│   │   ├── send.ts           # 消息发送
│   │   ├── accounts.ts       # 账号凭证管理
│   │   ├── types.ts          # 协议类型定义
│   │   ├── media.ts          # 图片/文本消息解析
│   │   ├── cdn.ts            # 微信 CDN 媒体下载
│   │   ├── crypto.ts         # AES 加密解密
│   │   └── sync-buf.ts       # 消息同步缓冲
│   └── claude/
│       └── provider.ts       # Claude Code CLI 调用（child_process + 环境变量加载）
└── out/                      # 编译输出（.vsix 打包时包含）
```

### 本地开发

```bash
# 1. 克隆项目
git clone https://gitee.com/jiadx1/wechat-vscode.git
cd wechat-vscode

# 2. 安装依赖
npm install

# 3. 监听模式编译（文件变更自动重编译）
npm run watch

# 4. 在 VSCode 中按 F5 启动 Extension Development Host 调试
```

### 关键命令

```bash
# 编译 TypeScript
npm run compile

# esbuild 开发模式打包（带 sourcemap）
npm run esbuild

# 监听模式编译
npm run watch

# 一键打包（推荐，含环境检查）
./build.sh

# 手动打包 .vsix
npm run package
```

## 📦 打包部署

### 一键打包（推荐）

```bash
./build.sh
```

脚本会自动执行：环境检查 → 清理旧产物 → 安装依赖 → 文件检查 → 类型检查 → esbuild 打包 → 生成 VSIX。

### 手动打包

```bash
# 确保已安装依赖
npm install

# esbuild 打包所有依赖为单文件 + 生成 VSIX
npm run package
```

打包成功后在项目根目录生成 `wechat-vscode-0.1.0.vsix` 文件。

### 安装到 VSCode

```bash
# 方式一：命令行安装
code --install-extension wechat-vscode-0.1.0.vsix

# 方式二：VSCode 命令面板
# Ctrl+Shift+P → Extensions: Install from VSIX... → 选择 .vsix 文件
```

### 卸载

```bash
# 命令行卸载
code --uninstall-extension wechat-vscode.wechat-vscode

# 或在 VSCode 扩展面板中右键 → Uninstall
```

## 🏗️ 工作原理

```
┌─────────────┐     ilink bot API      ┌──────────────────┐     child_process     ┌──────────────┐
│  微信（手机） │ ◄────────────────────► │  VSCode 扩展后台  │ ◄───────────────────► │ Claude Code  │
│  发送消息     │     长轮询 + 发送      │  消息监听守护进程  │    execFile('claude') │   CLI        │
└─────────────┘                        └──────────────────┘                        └──────────────┘
                                         ↕
                                  ┌──────────────────┐
                                  │   WebView 面板    │
                                  │  二维码 / 状态栏   │
                                  └──────────────────┘
```

1. **扫码绑定** — 调用微信 ilink bot API 生成二维码，用户扫码后获取 bot token
2. **消息监听** — 后台长轮询 `ilink/bot/getupdates`，接收微信消息
3. **Claude 处理** — 通过 `child_process.execFile` 调用 `claude -p <prompt>` 处理消息
4. **结果回复** — 将 Claude 的回复通过 `ilink/bot/sendmessage` 发送回微信

## 📂 数据目录

与 [wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code) 共享数据目录：

```
~/.wechat-claude-code/
├── accounts/       # 微信账号凭证（bot token 等，每个账号一个 JSON）
├── config.env      # 全局配置（工作目录、模型、权限模式）
├── sessions/       # 会话数据（聊天记录、SDK session ID）
├── get_updates_buf # 消息轮询同步缓冲
└── logs/           # 运行日志（按天轮转，保留 30 天）
```

## ⚠️ 注意事项

- 需要安装 Claude Code CLI 并确保 `claude` 命令在 PATH 中可用（可在设置中自定义路径）
- 微信 ilink bot API 依赖网络连通性（`ilinkai.weixin.qq.com`）
- 会话过期后需要重新扫码绑定
- Claude Code CLI 调用超时时间为 5 分钟，超长任务可能超时
- 当前版本暂不支持图片消息处理（仅文字消息转发给 Claude）
- 环境变量可通过 VSCode Settings 配置，无需在终端中 export

## 📄 License

MIT
