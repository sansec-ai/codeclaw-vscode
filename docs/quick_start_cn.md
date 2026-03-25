# 快速开始指南

5 分钟内完成 WeChat Claude Code 的安装和配置。

## 前置条件

| 要求 | 说明 |
|------|------|
| **VSCode** | >= 1.85.0 |
| **微信** | iOS 微信，支持 ClawBot 功能（目前为内测阶段） |
| **API 密钥** | Anthropic API 密钥或兼容的 API 提供商（如 OpenRouter、AWS Bedrock、自定义代理端点） |

> **运行时无需 Node.js** — Claude Code CLI 已内置打包在插件中。

## 第一步：安装插件

### 方式一：从 VSIX 安装（推荐）

```bash
code --install-extension wechat-claude-vscode-0.1.77.vsix
```

或在 VSCode 中：`Ctrl+Shift+P` → `Extensions: Install from VSIX...` → 选择文件。

### 方式二：从 VSCode Marketplace 安装

打开扩展视图（`Ctrl+Shift+X`），搜索 **"WeChat Claude Code"**，点击 **Install**。

### 方式三：从源码构建

```bash
git clone https://github.com/your-username/wechat-claude-vscode.git
cd wechat-claude-vscode
npm install
./build.sh
code --install-extension wechat-claude-vscode-0.1.77.vsix
```

## 第二步：配置 API 凭证

打开 VSCode 设置（`Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`），添加：

### 使用 Anthropic 官方 API

```jsonc
{
  "wechat-vscode.environmentVariables": [
    { "name": "ANTHROPIC_API_KEY", "value": "sk-ant-xxxxx" },
    { "name": "ANTHROPIC_MODEL", "value": "claude-sonnet-4-6" }
  ]
}
```

### 使用第三方 API 代理

```jsonc
{
  "wechat-vscode.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "https://your-proxy.example.com" },
    { "name": "ANTHROPIC_AUTH_TOKEN", "value": "your-token-here" },
    { "name": "ANTHROPIC_MODEL", "value": "claude-sonnet-4-6" }
  ]
}
```

> **已经安装了 Claude Code 插件？** 如果你已配置了 `claudeCode.environmentVariables`，本插件会自动读取，无需重复配置。

## 第三步：打开项目

在 VSCode 中打开一个项目文件夹，这就是 Claude 的工作目录。

```
文件 → 打开文件夹 → /path/to/your/project
```

## 第四步：连接微信

1. 点击 VSCode 左侧 Activity Bar 的 **微信图标**（📱）
2. 在面板中点击 **"连接微信"** 按钮
3. 弹出二维码 — 用 **手机微信** 扫描
4. 等待 "✅ 绑定成功" 提示

底部状态栏应显示 `WeChat: ✅ 已连接`。

## 第五步：开始对话

打开手机微信，找到 **ClawBot** 会话，发送消息：

```
你好，请介绍一下当前项目的结构
```

Claude Code 会分析你的项目并直接在微信中回复。

## 常用命令

| 命令 | 功能 |
|------|------|
| `/help` | 显示所有可用命令 |
| `/new` | 开启新会话（清除上下文） |
| `/cwd /path/to/dir` | 切换 Claude 的工作目录 |
| `/model claude-sonnet-4-6` | 切换 Claude 模型 |
| `/mode 2` | 切换到自动接受文件编辑模式 |
| `/status` | 查看当前会话信息 |

**权限模式快捷键：** `0` = 仅规划，`1` = 默认逐次确认，`2` = 自动接受编辑，`3+` = 跳过所有权限

## 使用技巧

- **长回复**：Claude 的完整回复会作为一条消息发送（不拆分）。较大的输出可能需要稍等片刻。
- **图片识别**：直接从微信发送截图，Claude 可以分析图片内容。
- **流式输出**：默认开启，Claude 的中间工具调用记录在 VSCode 输出通道中（`查看 → 输出 → WeChat Claude Code`），只有最终结果发送到微信。
- **自动重连**：VSCode 重启后，插件会自动使用已保存的凭证重新连接。
- **会话过期**：如果微信会话过期，点击侧边栏的 "重新绑定" 扫描新的二维码即可。

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| 二维码过期 | 点击 "重新绑定" 生成新的二维码 |
| 微信没有收到回复 | 查看 VSCode 输出通道是否有错误；检查 API 凭证是否正确 |
| "Claude 无返回内容" | 尝试发送 `/new` 开启新会话 |
| API 连接被拒绝 | 确认 `ANTHROPIC_BASE_URL` 在你的网络环境中可访问 |
| Claude 不断请求权限确认 | 使用 `/mode 2` 自动接受文件编辑，或 `/mode 3` 跳过所有权限 |
