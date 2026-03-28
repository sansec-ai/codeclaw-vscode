// ── Internationalization (i18n) module ─────────────────────────────────────
// Supports zh-CN (and zh-* variants) and en-US (default fallback).
// Uses %s placeholders for dynamic arguments: t('key', arg1, arg2, ...)

type Messages = Record<string, string>;

// ── Chinese (zh-CN) messages ───────────────────────────────────────────────

const zh: Messages = {
  // ── Panel states ──
  disconnected: '未连接',
  connectedStatus: '%s已连接 — %s',
  processingStatus: '⏳ 正在处理消息...',

  // ── Panel buttons (Webview HTML) ──
  connectBtn: '🔗 连接IM应用',
  disconnectBtn: '断开连接',
  switchChannelBtn: '切换渠道',
  reconnectBtn: '🔄 重新连接',
  qrAlt: '微信绑定二维码',
  qrHint: '请使用微信扫描上方二维码',
  helpTextHtml: '连接IM应用后，可在 IM 中发送消息操作当前项目。<br/>\n    发送 /help 查看可用命令。',

  // ── Status bar ──
  statusBarDisconnected: '%s: 未连接',
  statusBarDisconnectedTooltip: '%s 未连接 - 点击连接',
  statusBarConnecting: '%s: 连接中...',
  statusBarConnectingTooltip: '正在连接%s...',
  statusBarScanning: '%s: 等待扫码',
  statusBarScanningTooltip: '请用微信扫描二维码',
  statusBarConnected: '%s: 已连接',
  statusBarConnectedTooltip: '%s已连接',
  statusBarProcessing: '%s: 处理中...',
  statusBarProcessingTooltip: '正在处理%s消息',
  statusBarError: '%s: 错误',
  statusBarErrorTooltip: '%s连接错误',

  // ── Channel names ──
  channelWechat: '微信',
  channelTelegram: 'Telegram',

  // ── Channel picker ──
  channelWechatLabel: '💬 微信',
  channelWechatDesc: '扫码绑定 ClawBot',
  channelTelegramLabel: '✈️ Telegram',
  channelTelegramDesc: '输入 Bot Token 连接',
  chooseChannel: '选择连接渠道',

  // ── Telegram setup ──
  telegramTokenPrompt: '请输入 Telegram Bot Token (从 @BotFather 获取)',
  telegramTokenPlaceholder: '例如：1234567890:ABCdefGHIjklMNOpqrsTUVwxyz',
  telegramVerifying: '正在验证 Telegram Bot Token...',
  telegramConnected: 'Telegram Bot @%s 连接成功！',
  telegramTokenInvalid: '❌ Token 无效或已过期',
  telegramTokenInvalidMsg: 'Telegram Token 无效，请检查后重试。',
  telegramBindFailed: '❌ 绑定失败: %s',
  telegramBindFailedMsg: 'Telegram 绑定失败: %s',

  // ── QR bind ──
  qrGenerating: '正在生成二维码，请稍候...',
  wechatBound: '微信绑定成功！',
  qrExpired: '二维码已过期，请重试。',
  qrScanFailed: '二维码扫描失败: %s',
  wechatBindFailed: '微信绑定失败: %s',

  // ── General errors/warnings ──
  openFolderFirst: '请先在 VSCode 中打开一个项目文件夹',
  openFolderFirstStatus: '⚠️ 请先打开一个项目文件夹',
  alreadyConnected: '%s已连接，无需重复连接。',
  anotherWindowConnected: '⚠️ 另一个 VSCode 窗口已连接此账号，请先断开该窗口。',
  anotherWindowConnectedStatus: '⚠️ 另一个 VSCode 窗口已连接此账号',
  anotherWindowConnectedTelegram: '⚠️ 另一个 VSCode 窗口已连接此 Telegram 账号，无法同时连接。',
  anotherWindowConnectedWechat: '⚠️ 另一个 VSCode 窗口已连接此账号，无法同时连接。',
  disconnectedMsg: '%s已断开连接。点击"重新连接"可快速恢复。',
  disconnectedStatus: '已断开连接',
  noWorkspaceReconnect: '请打开项目文件夹后重新连接',

  // ── New account notification ──
  telegramReplaced: '⚠️ 检测到新的 Telegram 账号已绑定，当前连接已断开。',
  wechatReplaced: '⚠️ 检测到新的微信账号已绑定，当前连接已断开。',

  // ── Session expired ──
  sessionExpiredStatus: '⚠️ %s会话已过期，请重新绑定',
  sessionExpiredMsg: '%s会话已过期，请重新扫码绑定。',

  // ── Message processing ──
  busyProcessing: '⏳ 正在处理上一条消息，请稍后...',

  // ── Slash commands ──
  helpText: [
    '可用命令：',
    '',
    '  /help             显示帮助',
    '  /new              开启新会话',
    '  /model <名称>     切换 Claude 模型',
    '  /mode <模式>      切换权限模式 (default/acceptEdits/plan)',
    '  /status           查看当前会话状态',
    '',
    '直接输入文字即可与 Claude Code 对话（连续会话）',
  ].join('\n'),

  newSessionOk: '✅ 已开启新会话。',

  cwdCurrent: '当前工作目录: %s\n用法: /cwd <路径>',
  cwdChanged: '✅ 工作目录已切换为: %s',

  modelUsage: '用法: /model <模型名称>\n例: /model claude-sonnet-4-6',
  modelChanged: '✅ 模型已切换为: %s',

  modeCurrent: [
    '当前权限模式: %s',
    '',
    '可用模式（名称或数字快捷键）:',
    '  0 / plan              仅规划不执行',
    '  1 / default            默认（逐次确认）',
    '  2 / acceptEdits        自动接受文件编辑',
    '  3 / bypassPermissions  跳过所有权限检查',
    '',
    '用法: /mode <模式名或数字>',
  ].join('\n'),
  modeInvalid: '❌ 无效模式: %s\n可用: 0(plan), 1(default), 2(acceptEdits), 3(bypassPermissions)',
  modeChanged: '✅ 权限模式已切换为: %s',

  statusTitle: '📊 会话状态',
  statusCwd: '工作目录: %s',
  statusModel: '模型: %s',
  statusMode: '权限模式: %s（%s）',
  statusState: '会话状态: %s',
  statusContinued: '连续会话: %s',
  statusYes: '是',
  statusNo: '否',
  modeDescDefault: '默认（逐次确认）',
  modeDescAcceptEdits: '自动接受编辑',
  modeDescPlan: '仅规划',
  statusDefaultModel: '默认',

  unknownCommand: '❓ 未知命令: /%s\n输入 /help 查看可用命令',

  unsupportedMessageType: '暂不支持此类型消息，请发送文字或图片',
  analyzeImage: '请分析这张图片',

  // ── Claude errors ──
  claudeError: '⚠️ Claude 处理请求时出错:\n%s',
  claudeEmpty: 'ℹ️ Claude 无返回内容',
  messageError: '⚠️ 处理消息时出错，请稍后重试。',

  // ── Message truncation ──
  messageTruncated: '**由于%s消息限制，以下是部分内容，完整内容请到VSCode查看**',

  // ── Permission denials ──
  permissionDenied: [
    '⚠️ 部分操作因权限限制未执行',
    '',
    '被拒绝的工具: %s',
    '',
    '当前权限模式: %s',
    '',
    '如需自动授权，请发送:',
    '  /mode 2  (自动接受文件编辑)',
    '  /mode 3  (跳过所有权限检查)',
  ].join('\n'),

  // ── Permission broker ──
  permissionRequestTitle: '🔧 权限请求',
  permissionToolLabel: '工具: %s',
  permissionInputLabel: '输入: %s',
  permissionReplyHint: '回复 y 允许，n 拒绝',
  permissionTimeoutHint: '(120秒未回复自动拒绝)',

  // ── Checklist tracker ──
  checklistProgress: '📋 任务进度 %s%%',

  // ── Session ──
  noChatHistory: '暂无对话记录',
  chatRoleUser: '用户',

  // ── No workspace fallback ──
  noWorkspaceDir: '无工作目录',
};

// ── English (en-US) messages ───────────────────────────────────────────────

const en: Messages = {
  // ── Panel states ──
  disconnected: 'Disconnected',
  connectedStatus: '%s Connected — %s',
  processingStatus: '⏳ Processing...',

  // ── Panel buttons (Webview HTML) ──
  connectBtn: '🔗 Connect',
  disconnectBtn: 'Disconnect',
  switchChannelBtn: 'Switch Channel',
  reconnectBtn: '🔄 Reconnect',
  qrAlt: 'WeChat QR Code',
  qrHint: 'Scan the QR code with WeChat',
  helpTextHtml: 'After connecting an IM app, you can send messages from IM to operate on the current project.<br/>\n    Send /help to see available commands.',

  // ── Status bar ──
  statusBarDisconnected: '%s: Disconnected',
  statusBarDisconnectedTooltip: '%s Disconnected - Click to connect',
  statusBarConnecting: '%s: Connecting...',
  statusBarConnectingTooltip: 'Connecting to %s...',
  statusBarScanning: '%s: Scanning...',
  statusBarScanningTooltip: 'Scan the QR code with WeChat',
  statusBarConnected: '%s: Connected',
  statusBarConnectedTooltip: '%s Connected',
  statusBarProcessing: '%s: Processing...',
  statusBarProcessingTooltip: 'Processing %s message',
  statusBarError: '%s: Error',
  statusBarErrorTooltip: '%s connection error',

  // ── Channel names ──
  channelWechat: 'WeChat',
  channelTelegram: 'Telegram',

  // ── Channel picker ──
  channelWechatLabel: '💬 WeChat',
  channelWechatDesc: 'Scan QR to bind ClawBot',
  channelTelegramLabel: '✈️ Telegram',
  channelTelegramDesc: 'Enter Bot Token to connect',
  chooseChannel: 'Choose a channel',

  // ── Telegram setup ──
  telegramTokenPrompt: 'Enter Telegram Bot Token (get from @BotFather)',
  telegramTokenPlaceholder: 'e.g.: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz',
  telegramVerifying: 'Verifying Telegram Bot Token...',
  telegramConnected: 'Telegram Bot @%s connected!',
  telegramTokenInvalid: '❌ Token invalid or expired',
  telegramTokenInvalidMsg: 'Telegram Token is invalid. Please check and try again.',
  telegramBindFailed: '❌ Bind failed: %s',
  telegramBindFailedMsg: 'Telegram bind failed: %s',

  // ── QR bind ──
  qrGenerating: 'Generating QR code, please wait...',
  wechatBound: 'WeChat bound successfully!',
  qrExpired: 'QR code expired. Please try again.',
  qrScanFailed: 'QR scan failed: %s',
  wechatBindFailed: 'WeChat bind failed: %s',

  // ── General errors/warnings ──
  openFolderFirst: 'Please open a project folder in VSCode first',
  openFolderFirstStatus: '⚠️ Please open a project folder first',
  alreadyConnected: '%s is already connected.',
  anotherWindowConnected: '⚠️ Another VSCode window is already connected. Please disconnect that window first.',
  anotherWindowConnectedStatus: '⚠️ Another VSCode window is already connected to this account',
  anotherWindowConnectedTelegram: '⚠️ Another VSCode window is already connected to this Telegram account.',
  anotherWindowConnectedWechat: '⚠️ Another VSCode window is already connected to this account.',
  disconnectedMsg: '%s disconnected. Click "Reconnect" to quickly restore.',
  disconnectedStatus: 'Disconnected',
  noWorkspaceReconnect: 'Please open a project folder to reconnect',

  // ── New account notification ──
  telegramReplaced: '⚠️ A new Telegram account has been bound. The current connection is disconnected.',
  wechatReplaced: '⚠️ A new WeChat account has been bound. The current connection is disconnected.',

  // ── Session expired ──
  sessionExpiredStatus: '⚠️ %s session expired, please rebind',
  sessionExpiredMsg: '%s session expired. Please scan QR to rebind.',

  // ── Message processing ──
  busyProcessing: '⏳ Processing previous message, please wait...',

  // ── Slash commands ──
  helpText: [
    'Available commands:',
    '',
    '  /help             Show help',
    '  /new              Start new session',
    '  /model <name>     Switch Claude model',
    '  /mode <mode>      Switch permission mode (default/acceptEdits/plan)',
    '  /status           Show current session status',
    '',
    'Type a message to chat with Claude Code (continuous session)',
  ].join('\n'),

  newSessionOk: '✅ New session started.',

  cwdCurrent: 'Current working directory: %s\nUsage: /cwd <path>',
  cwdChanged: '✅ Working directory changed to: %s',

  modelUsage: 'Usage: /model <model name>\nExample: /model claude-sonnet-4-6',
  modelChanged: '✅ Model switched to: %s',

  modeCurrent: [
    'Current permission mode: %s',
    '',
    'Available modes (name or number shortcut):',
    '  0 / plan              Plan only, no execution',
    '  1 / default            Default (confirm each action)',
    '  2 / acceptEdits        Auto-accept file edits',
    '  3 / bypassPermissions  Skip all permission checks',
    '',
    'Usage: /mode <mode name or number>',
  ].join('\n'),
  modeInvalid: '❌ Invalid mode: %s\nAvailable: 0(plan), 1(default), 2(acceptEdits), 3(bypassPermissions)',
  modeChanged: '✅ Permission mode switched to: %s',

  statusTitle: '📊 Session Status',
  statusCwd: 'Working directory: %s',
  statusModel: 'Model: %s',
  statusMode: 'Permission mode: %s (%s)',
  statusState: 'Session state: %s',
  statusContinued: 'Continuous session: %s',
  statusYes: 'Yes',
  statusNo: 'No',
  modeDescDefault: 'Default (confirm each action)',
  modeDescAcceptEdits: 'Auto-accept edits',
  modeDescPlan: 'Plan only',
  statusDefaultModel: 'Default',

  unknownCommand: '❓ Unknown command: /%s\nType /help to see available commands',

  unsupportedMessageType: 'This message type is not supported. Please send text or images.',
  analyzeImage: 'Please analyze this image',

  // ── Claude errors ──
  claudeError: '⚠️ Claude encountered an error processing the request:\n%s',
  claudeEmpty: 'ℹ️ Claude returned no content',
  messageError: '⚠️ Error processing message. Please try again later.',

  // ── Message truncation ──
  messageTruncated: '**Due to %s message limits, showing partial content. View full content in VSCode**',

  // ── Permission denials ──
  permissionDenied: [
    '⚠️ Some operations were not executed due to permission restrictions',
    '',
    'Denied tools: %s',
    '',
    'Current permission mode: %s',
    '',
    'To auto-authorize, send:',
    '  /mode 2  (auto-accept file edits)',
    '  /mode 3  (skip all permission checks)',
  ].join('\n'),

  // ── Permission broker ──
  permissionRequestTitle: '🔧 Permission Request',
  permissionToolLabel: 'Tool: %s',
  permissionInputLabel: 'Input: %s',
  permissionReplyHint: 'Reply y to allow, n to deny',
  permissionTimeoutHint: '(Auto-denied after 120s of no reply)',

  // ── Checklist tracker ──
  checklistProgress: '📋 Task Progress %s%%',

  // ── Session ──
  noChatHistory: 'No chat history',
  chatRoleUser: 'User',

  // ── No workspace fallback ──
  noWorkspaceDir: 'No workspace',
};

// ── Locale detection & initialization ──────────────────────────────────────

let currentLocale: string = detectLocale();

/**
 * Detect locale from environment.
 * Priority: passed argument > process.env.LANG > navigator.language > 'en'
 */
function detectLocale(fallback?: string): string {
  if (fallback) {
    return isZhLocale(fallback) ? 'zh' : 'en';
  }
  const env = (process as any).env;
  if (env?.LANG && isZhLocale(env.LANG)) {
    return 'zh';
  }
  if (typeof navigator !== 'undefined' && navigator.language && isZhLocale(navigator.language)) {
    return 'zh';
  }
  return 'en';
}

function isZhLocale(locale: string): boolean {
  return /^zh\b/i.test(locale.replace(/_/g, '-').split('.')[0]);
}

/**
 * Initialize locale. Call this in activate() with vscode.env.language.
 * Can also be called without arguments (uses env detection as fallback).
 */
export function initLocale(locale?: string): void {
  currentLocale = detectLocale(locale);
}

/**
 * Get the current locale identifier ('zh' or 'en').
 */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Look up a translated message by key, substituting %s placeholders with args.
 */
export function t(key: string, ...args: (string | number)[]): string {
  const messages = currentLocale === 'zh' ? zh : en;
  let msg = messages[key] ?? zh[key] ?? key;

  if (args.length > 0) {
    // Replace each %s with the corresponding arg
    for (const arg of args) {
      msg = msg.replace('%s', String(arg));
    }
  }

  return msg;
}
