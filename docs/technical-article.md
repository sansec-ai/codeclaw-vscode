# 从微信到 VSCode：用 ClawBot API 构建 Claude Code 远程控制插件

> English readers: This article is available in Chinese. For the user-facing documentation, see [README.md](../README.md).

## 1. 引言

你有没有过这样的时刻——通勤地铁上突然想到一个 bug 的修复方案，但手边只有手机；躺在床上不想开电脑，却想让 AI 帮你写一个新功能；或者在外出差，需要远程 review 一下代码改动？

这就是 **Code Claw** 诞生的原因。它是一个 VSCode 扩展，把你的个人微信或 Telegram 变成 Claude Code 的远程终端——手机发消息，电脑上的 Claude Code 帮你写代码。

本文将深入介绍项目的技术实现，包括微信 ClawBot API 协议、Telegram Bot API 集成、Claude Agent SDK 集成、VSCode 扩展架构设计、国际化支持，以及开发过程中遇到的关键挑战和解决方案。

## 2. 微信 ClawBot 是什么

ClawBot（智能对话机器人）是微信官方推出的 Bot API，代号 **iLink**，基于域名 `ilinkai.weixin.qq.com`。它与微信的其他 Bot 方案有本质区别：

| 特性 | ClawBot (iLink) | 公众号 API | 企业微信 API |
|------|-----------------|-----------|-------------|
| 绑定对象 | 个人微信号 | 公众号 | 企业微信 |
| 消息类型 | 文本/图片/文件/视频/语音 | 文本/图片/图文 | 文本/图片/文件 |
| 认证方式 | QR 码扫描 + Bot Token | AppID/Secret | CorpID/Secret |
| 使用门槛 | 内测阶段 | 需认证 | 需企业注册 |
| 消息方向 | 双向收发 | 被动回复/模板消息 | 双向收发 |

ClawBot 最大的优势是**直接绑定个人微信号**——用户不需要关注公众号或加入企业微信，扫码即可使用。Bot 收到的消息来自真实的微信聊天，回复也会直接出现在用户的微信对话中，体验极其自然。

## 3. iLink Bot API 协议详解

### 3.1 API 端点

iLink Bot API 的所有端点都基于 `https://ilinkai.weixin.qq.com`，使用 POST 方法：

#### 获取登录二维码

```
POST /ilink/bot/get_bot_qrcode?bot_type=3
```

返回二维码图片 URL（`qrcode_img_content`）和二维码 ID（`qrcode`），用于后续轮询扫码状态。

#### 轮询扫码状态

```
POST /ilink/bot/get_qrcode_status?qrcode=<qrcode_id>
```

返回状态值：
- `wait` — 等待扫描
- `scaned` — 已扫描，等待确认
- `confirmed` — 已确认，返回 `bot_token`、`ilink_bot_id`、`baseurl`、`ilink_user_id`
- `expired` — 二维码过期

#### 长轮询接收消息

```
POST /ilink/bot/getupdates
Body: { "get_updates_buf": "<sync_buf>" }
```

这是整个系统的核心端点。它使用**长轮询**模式：服务端在有新消息时返回，没有新消息时挂起等待（超时约 30 秒后返回空结果）。返回值中的 `get_updates_buf` 是同步游标，下次请求时传入即可续传。

#### 发送消息

```
POST /ilink/bot/sendmessage
Body: { "msg": { ... } }
```

#### 获取配置

```
POST /ilink/bot/getconfig
```

返回配置信息，包含 `typing_ticket`（用于发送"正在输入"状态）。

#### 发送输入状态

```
POST /ilink/bot/sendtyping
```

让用户的微信界面显示 Bot "正在输入..."的状态。

#### 获取媒体上传 URL

```
POST /ilink/bot/getuploadurl
Body: { "file_type": "image", "file_size": 12345, "file_name": "photo.jpg" }
```

返回预签名的上传 URL 和 AES 加密密钥，用于上传图片/文件/视频到微信 CDN。

### 3.2 认证方式

所有 API 请求需要三个 HTTP Header：

```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${botToken}`,
  'AuthorizationType': 'ilink_bot_token',
  'X-WECHAT-UIN': randomUin,  // 随机生成的 Base64 UUID
}
```

其中 `X-WECHAT-UIN` 是每次启动时随机生成的，用于标识客户端实例。

### 3.3 消息类型

```typescript
// 消息方向
enum MessageType {
  USER = 1,   // 用户发给 Bot
  BOT = 2,    // Bot 发给用户
}

// 消息状态
enum MessageState {
  NEW = 0,       // 新消息
  GENERATING = 1,  // 正在生成中
  FINISH = 2,     // 生成完成
}
```

### 3.4 消息内容结构

每条消息包含一个 `item_list` 数组，支持多种内容类型：

```typescript
interface MessageItem {
  type: MessageItemType;  // 1=TEXT, 2=IMAGE, 3=VOICE, 4=FILE, 5=VIDEO
  text_item?: { text: string };
  image_item?: { cdn_media?: CDNMedia; url?: string };
  voice_item?: { cdn_media: CDNMedia; voice_text?: string };
  file_item?: { cdn_media: CDNMedia; file_name?: string };
  video_item?: { cdn_media: CDNMedia };
}
```

### 3.5 重要限制

在实际开发中，我们发现 iLink Bot API 有几个关键限制：

1. **每次 getupdates 最多返回 10 条消息**：需要用 `get_updates_buf` 游标分页续传。
2. **同一 context_token 下客户端最多显示约 10 条 Bot 消息**：超过的消息会被微信客户端**静默丢弃**（不会报错，但用户看不到）。
3. **发送间隔限制**：连续发送消息需要至少 800ms 间隔，否则可能触发静默限流。
4. **会话过期**：Bot Token 有有效期，过期后 `getupdates` 返回错误码 `-14`，需要重新扫码。

## 4. Claude Agent SDK 集成

### 4.1 SDK 概述

本项目使用 `@anthropic-ai/claude-agent-sdk`（版本 0.1.77）与 Claude Code 交互。SDK 提供了 `query()` 函数，返回一个 `AsyncIterable<SDKMessage>`，可以逐条获取 Claude 的响应消息：

```typescript
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

const result = query({
  prompt: "Help me create a hello world app",
  options: {
    cwd: "/path/to/project",
    permissionMode: "acceptEdits",
    includePartialMessages: true,  // 启用流式
  },
});

for await (const message of result) {
  switch (message.type) {
    case 'assistant':
      // Claude 的文本回复或工具调用
      break;
    case 'tool_progress':
      // 工具执行进度
      break;
    case 'result':
      // 最终结果
      break;
  }
}
```

### 4.2 流式输出

SDK 支持通过 `includePartialMessages: true` 开启流式模式。开启后，`assistant` 类型的消息会在 Claude 思考和调用工具的过程中**多次 yield**，每次包含当前已生成的部分内容。这让我们可以实时获取 Claude 的中间过程。

在本项目中，流式输出的中间消息仅记录到日志（`logger.info`），不发送到微信。最终结果作为一条完整消息发送。这是为了应对 ClawBot 的 10 条消息显示限制。

### 4.3 会话续接

SDK 的 `resume` 参数用于实现连续会话。第一次调用时 SDK 返回 `session_id`，后续调用传入该 `session_id`，Claude 就能记住之前的对话上下文：

```typescript
// 第一次调用
const result1 = await claudeQuery({ prompt: "创建一个 utils.js" });
const sessionId = result1.sessionId;

// 第二次调用（续接会话）
const result2 = await claudeQuery({
  prompt: "在 utils.js 中添加一个 formatDate 函数",
  resume: sessionId,  // 传入之前的 session ID
});
```

### 4.4 权限控制

SDK 提供 `canUseTool` 回调，允许在 Claude 尝试使用工具时进行权限控制。本插件通过 `permissionMode` 设置映射到不同的权限级别：

```typescript
const canUseTool: CanUseTool = async (toolName, input, opts) => {
  if (permissionMode === 'bypassPermissions') {
    return { behavior: 'allow', updatedInput: input };
  }
  // ... 其他权限逻辑
};
```

### 4.5 内置 CLI 打包

最巧妙的设计是：我们将 Claude Code CLI（`cli.js`，约 11MB）直接打包进 `.vsix` 文件。运行时通过 `pathToClaudeCodeExecutable` 指定内置 CLI 的路径：

```typescript
function findClaudeCliPath(): string {
  const bundledPath = path.join(__dirname, 'claude-code', 'cli.js');
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }
  throw new Error('Claude Code CLI not found. Please reinstall the extension.');
}

sdkOptions.pathToClaudeCodeExecutable = findClaudeCliPath();
```

这意味着用户不需要全局安装 Claude Code，安装 VSCode 扩展就拥有了完整的 Claude Code 能力。

## 5. VSCode 扩展架构设计

### 5.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                  VSCode Extension                        │
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌───────────────────┐  │
│  │ Extension│───→│  Daemon   │───→│  Message Handler   │  │
│  │  Entry   │    │ (monitor) │    │  (handleMessage)   │  │
│  └────┬─────┘    └──────────┘    └────────┬──────────┘  │
│       │                                   │              │
│  ┌────▼─────┐                      ┌──────▼──────┐     │
│  │  Panel   │                      │   Claude     │     │
│  │ + Sidebar│                      │  Provider    │     │
│  └──────────┘                      └──────┬──────┘     │
│                                           │              │
│  ┌──────────┐                      ┌──────▼──────┐     │
│  │ StatusBar│                      │   WeChat     │     │
│  └──────────┘                      │   Sender     │     │
│                                    └─────────────┘     │
└─────────────────────────────────────────────────────────┘
```

核心数据流：**Extension Entry** → **Daemon（monitor loop）** → **Message Handler** → **Claude Provider** → **WeChat Sender**。

### 5.2 Extension Entry (`extension.ts`)

扩展入口负责三件事：

1. **注册命令**：`codeClaw.connect`、`codeClaw.disconnect`、`codeClaw.showPanel`
2. **注册侧边栏**：通过 `registerWebviewViewProvider` 注册 WebView
3. **自动重连**：激活时检查是否有已保存的账号凭证，有则自动启动 Daemon

### 5.3 Daemon (`monitor.ts`)

Daemon 是扩展的心脏，运行一个无限循环的长轮询：

```typescript
async function run(): Promise<void> {
  while (!controller.signal.aborted) {
    const buf = loadSyncBuf();
    const resp = await api.getUpdates(buf || undefined);

    // 保存同步游标
    if (resp.get_updates_buf) {
      saveSyncBuf(resp.get_updates_buf);
    }

    // 处理消息（带去重）
    for (const msg of resp.msgs ?? []) {
      if (msg.message_id && recentMsgIds.has(msg.message_id)) continue;
      recentMsgIds.add(msg.message_id);
      await callbacks.onMessage(msg);
    }
  }
}
```

关键设计：
- **消息去重**：使用 `Set<number>` 缓存最近 1000 条消息 ID，超过时淘汰一半
- **同步游标持久化**：`get_updates_buf` 保存到 `~/.wechat-claude-code/get_updates_buf`，重启后从上次位置继续
- **指数退避重连**：连续失败 3 次后退避 30 秒，否则 3 秒
- **会话过期处理**：收到错误码 `-14` 后暂停 1 小时，提示用户重新扫码

### 5.4 WebView Panel 和 Sidebar

扩展提供了两种 UI 入口：

- **WebView Panel**：独立的全屏面板窗口
- **Sidebar WebviewViewProvider**：嵌入在 Activity Bar 侧边栏中

两者共享状态，都支持显示 QR 码、连接状态、操作日志。通过 `ViewState` 接口统一管理 UI 状态：

```typescript
type ViewState = {
  connected: boolean;
  dotClass: 'disconnected' | 'connecting' | 'connected' | 'processing' | 'error';
  status: string;
  qrDataUri?: string;
  showConnectButton: boolean;
};
```

### 5.5 会话持久化

会话数据以 JSON 文件存储在 `~/.wechat-claude-code/sessions/<accountId>.json`：

```typescript
interface Session {
  sdkSessionId?: string;           // Claude SDK 会话 ID
  continuedSession?: boolean;      // 是否为续接会话
  workingDirectory: string;        // 工作目录
  model?: string;                  // 当前模型
  permissionMode?: string;         // 权限模式
  state: 'idle' | 'processing';    // 会话状态
  chatHistory: ChatMessage[];      // 对话历史
}
```

每次消息处理前后都会保存会话状态，确保 VSCode 重启后可以恢复上下文。

### 5.6 并发控制

使用会话状态锁防止并发处理：

```typescript
if (session.state === 'processing') {
  await sender.sendText(fromUserId, contextToken, '⏳ 正在处理上一条消息，请稍后...');
  return;
}
session.state = 'processing';
// ... 处理消息
session.state = 'idle';
```

## 6. 关键挑战与解决方案

### 6.1 ClawBot 10 条消息显示限制

这是开发中遇到的**最大挑战**。ClawBot 客户端对同一 `context_token` 下的 Bot 消息有约 10 条的显示上限。超过的消息不会报错，而是**静默丢弃**——用户根本看不到。

**解决方案**：最终结果合并为一条消息发送，不拆分。中间过程只记录日志，不发送到微信。`splitMessage()` 函数虽然实现了长消息分段，但在实际发送时只发送合并后的完整结果：

```typescript
// 最终结果只发一条
const finalText = plainText(result.text);
await sender.sendText(fromUserId, contextToken, finalText);
```

### 6.2 Markdown 转 WeChat 纯文本

微信不支持 Markdown 渲染，Claude 的回复（代码块、行内代码、粗体、链接等）必须转为纯文本。我们实现了一个 `plainText()` 函数：

```typescript
function plainText(md: string): string {
  let s = md;
  // 代码块 → 缩进文本
  s = s.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) =>
    '\n' + code.trim().split('\n').map(l => '  ' + l).join('\n') + '\n');
  // 行内代码 → 去掉反引号
  s = s.replace(/`([^`]+)`/g, '$1');
  // 标题 → 去掉 # 号
  s = s.replace(/^#{1,6}\s+/gm, '');
  // 粗体 → 纯文本
  s = s.replace(/\*\*(.+?)\*\*/g, '$1');
  // 链接 [text](url) → text (url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
  // 无序列表 → • 符号
  s = s.replace(/^\s*[-*+]\s+/gm, '• ');
  // ... 更多规则
  return s.trim();
}
```

### 6.3 流式输出的设计

SDK 的流式模式（`includePartialMessages: true`）会让 `assistant` 消息多次 yield。我们设计了两层策略：

1. **中间层**（`onIntermediate` 回调）：仅 `logger.info` 记录，不发微信
2. **最终层**：等 `result` 消息到达后，将所有文本部分合并，作为一条消息发送

这样既能在 VSCode Output Channel 中看到实时过程（方便调试），又不会触发 ClawBot 的消息数量限制。

### 6.4 Claude Code CLI 内置打包

`cli.js` 约 11MB，直接打包进 `.vsix` 增加了扩展体积，但换来的是**零配置体验**。用户不需要安装 Node.js、不需要 `npm install -g @anthropic-ai/claude-code`、不需要配置 PATH。

打包流程（`build.sh`）：
1. `npm install` 安装 SDK（`cli.js` 在 SDK 的 `node_modules` 中）
2. 复制 `cli.js` 到 `out/claude-code/` 目录
3. `.vscodeignore` 排除 `node_modules`，但保留 `out/claude-code/`
4. `vsce package` 打包生成 `.vsix`

### 6.5 环境变量三级优先级加载

Claude Code 需要的环境变量（`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL` 等）可能来自多个来源。我们实现了三级优先级：

```typescript
function buildSubprocessEnv(): Record<string, string | undefined> {
  const env: Record<string, string> = { ...process.env };

  // ① 最低优先：系统环境变量（已在 env 中）

  // ② 中等优先：claudeCode.environmentVariables（兼容 Claude Code 插件）
  const claudeEnv = readEnvVarArray(
    vscode.workspace.getConfiguration('claudeCode'), 'environmentVariables');
  for (const { name, value } of claudeEnv) { env[name] = value; }

  // ③ 最高优先：codeClaw.environmentVariables（本插件配置）
  const wechatEnv = readEnvVarArray(
    vscode.workspace.getConfiguration('codeClaw'), 'environmentVariables');
  for (const { name, value } of wechatEnv) { env[name] = value; }

  return env;
}
```

如果用户已经安装了 Claude Code 插件并配置了 API 密钥，本插件会自动读取——零额外配置。

## 7. 总结与展望

Code Claw 是一次有趣的尝试：把微信的官方 Bot API 和 Claude Code 的 AI 编码能力连接起来，创造了一个"手机远程编程"的体验。整个项目的技术栈简洁而高效：

- **iLink Bot API** 提供了微信消息收发能力
- **Claude Agent SDK** 提供了 AI 代码生成和执行能力
- **VSCode Extension API** 提供了编辑器集成能力

未来可能的改进方向：

- **语音消息支持**：iLink API 支持语音消息（`VoiceItem` 含 `voice_text` 字段），可以接入语音转文字
- **文件上传下载**：通过 `getuploadurl` 端点实现文件的双向传输
- **多账号管理**：支持同时绑定多个微信账号，不同账号操作不同项目
- **VSCode Marketplace 发布**：让更多用户方便地安装和使用
- **图片理解**：利用 Claude 的多模态能力，支持发送截图让 AI 分析代码界面

## 8. 多渠道架构：Telegram 支持

### 8.1 Channel 抽象层

为了支持多渠道（微信、Telegram、未来更多），我们设计了统一的 Channel 接口：

```typescript
// src/channels/types.ts
export interface Channel {
  channelType: 'wechat' | 'telegram';
  displayName: string;
  accountId: string;
  start(callbacks: ChannelCallbacks): void;
  stop(): void;
  getSender(): ChannelSender;
}

export interface ChannelMessage {
  id: string;
  fromUserId: string;
  text: string;
  imageUrl?: string;
  contextToken: string;
}

export interface ChannelSender {
  sendText(toUserId: string, contextToken: string, text: string): Promise<void>;
}
```

每个渠道实现自己的 `createXxxChannel()` 工厂函数，返回 `Channel` 接口。`startDaemon()` 根据账号的 `channelType` 字段选择创建对应的渠道：

```typescript
function startDaemon(account: AccountData, cwd: string): void {
  let channel: Channel;
  if (account.channelType === 'telegram') {
    channel = createTelegramChannel(account.botToken, { baseUrl, pollTimeout });
  } else {
    channel = createWeChatChannel(account);
  }
  // ...
}
```

### 8.2 Telegram 适配器

Telegram 使用长轮询（long-polling）接收消息：

```typescript
async function pollLoop(
  api: TelegramApi,
  callbacks: ChannelCallbacks,
  signal: AbortSignal,
  pollTimeout: number,
  allowedChatIds?: string[],
): Promise<void> {
  let offset = 0;
  while (!signal.aborted) {
    const updates = await api.getUpdates(offset, pollTimeout);
    for (const update of updates) {
      const channelMsg = toChannelMessage(update);
      if (channelMsg) await callbacks.onMessage(channelMsg);
      offset = update.update_id + 1;
    }
  }
}
```

### 8.3 向后兼容

老用户的账号数据中没有 `channelType` 字段，值为 `undefined`。代码中用严格等于 `'telegram'` 判断，`undefined !== 'telegram'` 自动走微信路径，确保向后兼容。

## 9. 国际化（i18n）

### 9.1 语言检测

根据 `vscode.env.language` 检测系统语言，中文地区（`zh-CN`、`zh-TW`、`zh-HK` 及其他 `zh-*`）使用中文，其他地区使用英文：

```typescript
function detectLocale(): 'zh' | 'en' {
  const lang = vscode.env.language || process.env.LANG || 'en';
  return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
```

### 9.2 `t()` 函数

所有用户可见文案通过 `t(key, ...args)` 函数获取，支持 `%s` 占位符：

```typescript
export function t(key: string, ...args: (string | number)[]): string {
  const locale = currentLocale;
  let text = messages[locale][key] || messages['en'][key] || key;
  args.forEach((arg, i) => {
    text = text.replace(`%s`, String(arg));
  });
  return text;
}
```

### 9.3 Webview 中的国际化

Webview HTML 模板中的文案通过 `esc(t('key'))` 嵌入：

```typescript
<button>${esc(t('connectBtn'))}</button>
// 中文: "🔗 连接IM应用"
// 英文: "🔗 Connect"
```

如果你也想让手机变成编程助手，欢迎试用 Code Claw。项目代码开源在 [GitHub](https://github.com/sansec-ai/codeclaw-vscode)，欢迎 Star 和 PR。
