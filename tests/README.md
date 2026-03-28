# CodeClaw VSCode 测试工具说明

## 一、测试套件总览

| 命令 | 数量 | 说明 |
|------|------|------|
| `npm run test:fast` | 58 | 单元测试，无需 GUI |
| `npm run test:e2e` | 34 | E2E 测试，需要 DISPLAY |

## 二、Mock Telegram 交互式测试（推荐）

用本地 Mock Telegram 服务器模拟完整的 **消息发送 → Claude 执行 → 回复** 流程。

### 前置条件

1. **Claude Code CLI 可用** — 插件通过 `claudeQuery` 调用 Claude Code 子进程处理消息，需要以下任一方式提供 API Key：
   - VSCode 设置 `codeClaw.environmentVariables` 添加 `ANTHROPIC_API_KEY`
   - 或系统环境变量 `ANTHROPIC_API_KEY` 已设置
   - 或已通过 `claude` CLI 登录过

2. **VSCode 可用** — 需要 `code` CLI 和图形界面（DISPLAY）

### 快速开始

```bash
# 终端 1：启动 Mock 交互服务器
node tests/mock-interactive.js
```

```
╔══════════════════════════════════════════════════════════╗
║   Mock Telegram Interactive Server                        ║
║   URL:    http://localhost:19920                          ║
║   Token:  e2e-test-token                                  ║
║   Bot:    @codeclaw_test_bot (id=987654321)              ║
║   User:   testuser (id=111222333)                        ║
╚══════════════════════════════════════════════════════════╝

💬 输入消息 > hello claude
  [MockAPI] getUpdates → 1 update(s)
  📥 用户: testuser: "hello claude"
  ⏳ 等待 Bot 回复...
  📤 Bot: "Hello! I'm Claude..."
```

### VSCode 配置步骤

1. 打开一个项目文件夹
2. 打开设置（`Ctrl+,`），搜索 `codeClaw.telegramApiBaseUrl`，设为：
   ```
   http://localhost:19920
   ```
3. 搜索 `codeClaw.telegramPollTimeout`，设为 `2`（加快轮询速度）
4. 侧边栏点击 Code Claw 图标
5. 点击 **"切换渠道"** → 选择 **Telegram**
6. 输入 Bot Token：`e2e-test-token`
7. 连接成功后状态栏显示 `✓ Telegram: 已连接`
8. 在 `mock-interactive.js` 终端中输入消息，观察 Claude 回复

### 测试场景

```bash
# 终端 1 已启动 mock-interactive.js

# 终端 1 输入：
💬 输入消息 > /help
💬 输入消息 > /status
💬 输入消息 > 帮我列出当前目录的文件
💬 输入消息 > /new
💬 输入消息 > /model claude-sonnet-4-6
```

### mock-interactive.js 交互命令

| 输入 | 说明 |
|------|------|
| 普通文本 | 模拟用户发送文本消息 |
| `/quit` | 退出服务器 |

## 三、Mock 消息发送工具（脚本模式）

不需要保持终端交互，适合自动化或一次性测试。

```bash
# 发送文本消息
node tests/mock-send.js "你好 Claude"

# 发送带图片的消息
node tests/mock-send.js --photo "看看这个图片"

# 查看 Bot 回复记录
node tests/mock-send.js --replies

# 清空回复记录
node tests/mock-send.js --clear

# 查看服务器状态
node tests/mock-send.js --status
```

> ⚠️ 使用前需先启动 mock-interactive.js 或单独启动 mock 服务器。

## 四、单独启动 Mock 服务器

如果不需要交互式输入，可以单独启动：

```bash
# Telegram Mock
node tests/mock-telegram-server.js --port 19920 --token e2e-test-token

# 微信 Mock（E2E 测试用，功能验证）
node tests/mock-wechat-server.js --port 19930 --token e2e-wechat-token
```

### Mock Telegram 服务器 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/bot<token>/getMe` | GET | 获取 Bot 信息 |
| `/bot<token>/getUpdates` | GET | 长轮询接收消息 |
| `/bot<token>/sendMessage` | POST | 发送消息 |

### Mock Telegram 编程接口

```javascript
const { createMockServer } = require('./tests/mock-telegram-server');

const mock = createMockServer({ port: 19920, token: 'e2e-test-token' });
await mock.start();

// 模拟用户发消息
mock.simulateUserText('Hello', 111222333);

// 模拟图片消息
mock.simulateUserPhoto('fake-file-id', 'caption');

// 获取 Bot 发出的消息
const replies = mock.getSentMessages();

// 等待 Bot 回复
await mock.waitForSentMessages(1, 5000);

await mock.stop();
```

### Mock 微信服务器 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/ilink/bot/get_bot_qrcode` | GET | 获取绑定二维码 |
| `/ilink/bot/get_qrcode_status` | GET | 轮询扫码状态（长轮询） |
| `/ilink/bot/getupdates` | POST | 获取消息 |
| `/ilink/bot/sendmessage` | POST | 发送消息 |

## 五、Mock 用户信息

### Telegram

| 角色 | ID | 用户名 |
|------|-----|--------|
| Bot | 987654321 | @codeclaw_test_bot |
| 用户 | 111222333 | testuser |

### 微信

| 角色 | ID |
|------|-----|
| Bot | mock_bot_id_001 |
| 用户 | mock_user_id_001 |

## 六、E2E 测试

```bash
npm run test:e2e
```

需要代理下载 VSCode Electron（首次 ~200MB，后续使用缓存）。

覆盖场景：扩展激活、账号管理、微信/Telegram Mock API、渠道适配器、连接生命周期、错误处理。

## 七、故障排查

### 端口被占用

```bash
fuser -k 19920/tcp   # 杀掉占用 Telegram mock 端口的进程
fuser -k 19930/tcp   # 杀掉占用微信 mock 端口的进程
```

### Claude 没有回复

1. 检查 `ANTHROPIC_API_KEY` 是否设置：
   ```bash
   echo $ANTHROPIC_API_KEY
   ```
2. 或在 VSCode 设置中配置 `codeClaw.environmentVariables`：
   ```json
   "codeClaw.environmentVariables": [
     { "name": "ANTHROPIC_API_KEY", "value": "sk-ant-xxx" }
   ]
   ```
3. 查看 VSCode Output 面板 → Code Claw 频道看日志

### Mock 服务器启动失败

```bash
# 检查端口
ss -tlnp | grep -E "19920|19930"

# 手动启动看报错
node tests/mock-interactive.js
```
