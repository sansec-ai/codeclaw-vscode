import * as vscode from 'vscode';
import { initLogger, logger } from './logger';
import { WeChatPanel, WeChatSidebarProvider, DISCONNECTED_STATE, connectedState, processingState, type ViewState } from './panel';
import { StatusBarManager } from './statusbar';
import { WeChatApi } from './wechat/api';
import { loadLatestAccount, saveAccount, type AccountData } from './wechat/accounts';
import { startQrLogin, waitForQrScan } from './wechat/login';
import { createSender } from './wechat/send';
import { extractText, extractFirstImageUrl } from './wechat/media';
import { MessageType, type WeixinMessage } from './wechat/types';
import { createSessionStore, type Session } from './session';
import { claudeQuery, type QueryOptions, plainText } from './claude/provider';
import { ChecklistTracker } from './claude/checklist-tracker';
import { reportPrompt } from './stats';
import { acquireInstanceLock, releaseInstanceLock } from './store';
import type { LockHandle } from './store';
import { createWeChatChannel } from './channels/wechat-adapter';
import { createTelegramChannel } from './channels/telegram-adapter';
import { TelegramApi } from './channels/telegram-api';
import type { Channel, ChannelMessage, ChannelCallbacks, ChannelSender } from './channels/types';
import { downloadImage } from './wechat/media';
import QRCode from 'qrcode';

// ========== Global State ==========
let panelInstance: WeChatPanel | undefined;
let sidebarProvider: WeChatSidebarProvider;
let statusBar: StatusBarManager;
let activeChannel: Channel | undefined;
let outputChannel: vscode.OutputChannel;
let extContext: vscode.ExtensionContext;

let currentAccount: AccountData | undefined;
let currentCwd: string | undefined;
let currentSession: Session | undefined;
let currentSessionStore: ReturnType<typeof createSessionStore> | undefined;
let qrBindAbort: AbortController | null = null;
let currentLock: LockHandle | null = null;

// ========== Helpers ==========

/** Get user-facing channel name, fallback to '微信' for backward compat */
function channelName(): string {
  return activeChannel?.displayName ?? '微信';
}

function getWorkspaceCwd(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

const HELP_TEXT = [
  '可用命令：',
  '',
  '  /help             显示帮助',
  '  /new              开启新会话',
  '  /model <名称>     切换 Claude 模型',
  '  /mode <模式>      切换权限模式 (default/acceptEdits/plan)',
  '  /status           查看当前会话状态',
  '',
  '直接输入文字即可与 Claude Code 对话（连续会话）',
].join('\n');

// ========== Activate / Deactivate ==========

export async function activate(ctx: vscode.ExtensionContext) {
  extContext = ctx;
  outputChannel = vscode.window.createOutputChannel('Code Claw');
  ctx.subscriptions.push(outputChannel);
  initLogger(outputChannel);

  statusBar = new StatusBarManager();
  ctx.subscriptions.push(statusBar);

  sidebarProvider = new WeChatSidebarProvider(
    ctx.extensionUri,
    () => handleConnect(),
    () => handleDisconnect(),
    () => handleRebind(),
  );
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WeChatSidebarProvider.viewType, sidebarProvider),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('codeClaw.connect', () => handleConnect()),
    vscode.commands.registerCommand('codeClaw.disconnect', () => handleDisconnect()),
    vscode.commands.registerCommand('codeClaw.showPanel', () => showOrCreatePanel()),
  );

  logger.info('Code Claw VSCode extension activated');

  // Auto-reconnect if account already bound AND workspace matches
  const account = loadLatestAccount();
  if (account) {
    const cwd = getWorkspaceCwd();
    if (!cwd) {
      logger.info('No workspace open, skipping auto-reconnect');
      statusBar.setStatus('disconnected');
      setUiState({
        ...DISCONNECTED_STATE,
        status: '请打开项目文件夹后重新连接',
        connectLabel: '🔄 重新连接',
      });
    } else {
      const lock = acquireInstanceLock(account.accountId);
      if (!lock) {
        logger.warn('Another VSCode instance is already connected', { accountId: account.accountId });
        statusBar.setStatus('disconnected');
        setUiState({
          ...DISCONNECTED_STATE,
          status: '⚠️ 另一个 VSCode 窗口已连接此账号',
          dotClass: 'error',
          showConnect: false,
          showDisconnect: true,
          showQr: false,
        });
      } else {
        currentLock = lock;
        if (account.boundCwd !== cwd) {
          account.boundCwd = cwd;
          saveAccount(account);
          logger.info('Auto-reconnect: updated boundCwd', { accountId: account.accountId, newCwd: cwd });
        }
        startDaemon(account, cwd);
        logger.info('Auto-reconnected on activation', { accountId: account.accountId });
      }
    }
  }
}

export function deactivate() {
  if (activeChannel) {
    activeChannel.stop();
    activeChannel = undefined;
  }
  if (currentLock) {
    releaseInstanceLock(currentLock);
    currentLock = null;
  }
  if (outputChannel) { outputChannel.dispose(); }
  logger.info('Extension deactivated');
}

// ========== UI State Management ==========

function setUiState(state: ViewState): void {
  sidebarProvider.setViewState(state);
  try { (panelInstance as any)?.setState?.(state); } catch {}
}

function updateStatus(status: string): void {
  sidebarProvider.updateStatus(status);
  try { (panelInstance as any)?.updateStatus?.(status); } catch {}
}

function showQrCode(dataUri: string): void {
  sidebarProvider.showQrCode(dataUri);
  try { (panelInstance as any)?.showQrCode?.(dataUri); } catch {}
}

function hideQrCode(): void {
  sidebarProvider.hideQrCode();
  try { (panelInstance as any)?.hideQrCode?.(); } catch {}
}

function showConnectButton(): void {
  sidebarProvider.showConnectButton();
  try { (panelInstance as any)?.showConnectButton?.(); } catch {}
}

function showOrCreatePanel(): void {
  if (panelInstance) {
    panelInstance.reveal();
    return;
  }
  const state = currentAccount
    ? connectedState(currentCwd || '无工作目录', channelName())
    : DISCONNECTED_STATE;
  panelInstance = WeChatPanel.createOrShow(extContext.extensionUri, state);
  panelInstance.onDidDispose(() => { panelInstance = undefined; });
  extContext.subscriptions.push(panelInstance);
}

// ========== Connect / Disconnect / Rebind ==========

async function handleConnect(): Promise<void> {
  const existingAccount = loadLatestAccount();
  if (existingAccount) {
    const cwd = getWorkspaceCwd();
    if (!cwd) {
      vscode.window.showWarningMessage('请先在 VSCode 中打开一个项目文件夹');
      return;
    }
    if (currentAccount && activeChannel) {
      vscode.window.showInformationMessage(`${channelName()}已连接，无需重复连接。`);
      return;
    }
    const lock = acquireInstanceLock(existingAccount.accountId);
    if (!lock) {
      vscode.window.showWarningMessage(`⚠️ 另一个 VSCode 窗口已连接此账号，请先断开该窗口。`);
      return;
    }
    currentLock = lock;
    if (existingAccount.boundCwd !== cwd) {
      existingAccount.boundCwd = cwd;
      saveAccount(existingAccount);
      logger.info('Updated boundCwd', { accountId: existingAccount.accountId, newCwd: cwd });
    }
    startDaemon(existingAccount, cwd);
    return;
  }

  // Not bound — show channel picker
  await showChannelPicker();
}

function handleDisconnect(): void {
  if (qrBindAbort) {
    qrBindAbort.abort();
    qrBindAbort = null;
  }

  const chName = channelName();
  stopDaemon();
  if (currentLock) {
    releaseInstanceLock(currentLock);
    currentLock = null;
  }
  setUiState({
    ...DISCONNECTED_STATE,
    status: '已断开连接',
    connectLabel: '🔄 重新连接',
    channelName: chName,
    showRebind: !!loadLatestAccount(),
  });
  statusBar.setStatus('disconnected');
  vscode.window.showInformationMessage(`${chName}已断开连接。点击"重新连接"可快速恢复。`);
  logger.info('Disconnected by user, account preserved');
}

async function handleRebind(): Promise<void> {
  if (qrBindAbort) {
    qrBindAbort.abort();
    qrBindAbort = null;
  }
  const chName = channelName();
  stopDaemon();
  if (currentLock) {
    releaseInstanceLock(currentLock);
    currentLock = null;
  }
  setUiState({
    ...DISCONNECTED_STATE,
    channelName: chName,
    showRebind: true,
  });
  await showChannelPicker();
}

/**
 * WeChat-specific QR bind flow.
 * Future channels (Telegram, etc.) will have their own setup flows.
 */
async function showChannelPicker(): Promise<void> {
  const pick = await vscode.window.showQuickPick([
    { label: '💬 微信', description: '扫码绑定 ClawBot', value: 'wechat' },
    { label: '✈️ Telegram', description: '输入 Bot Token 连接', value: 'telegram' },
  ], { placeHolder: '选择连接渠道' });

  if (!pick) return;

  if (pick.value === 'telegram') {
    await doTelegramSetup();
  } else {
    await doQrBind();
  }
}

/**
 * Telegram setup: prompt for bot token, verify, save account, start daemon.
 */
async function doTelegramSetup(): Promise<void> {
  const config = vscode.workspace.getConfiguration('codeClaw');
  const telegramApiBaseUrl = config.get<string>('telegramApiBaseUrl', 'https://api.telegram.org');
  const telegramPollTimeout = config.get<number>('telegramPollTimeout', 30);

  const token = await vscode.window.showInputBox({
    prompt: '请输入 Telegram Bot Token (从 @BotFather 获取)',
    placeHolder: '例如：1234567890:ABCdefGHIjklMNOpqrsTUVwxyz',
    password: true,
    ignoreFocusOut: true,
  });

  if (!token || !token.trim()) return;

  statusBar.setStatus('connecting');
  updateStatus('正在验证 Telegram Bot Token...');

  try {
    const api = new TelegramApi(token.trim(), telegramApiBaseUrl);
    const bot = await api.getMe();
    logger.info('Telegram bot verified', { botUsername: bot.username, botId: bot.id });

    const cwd = getWorkspaceCwd();
    if (!cwd) {
      updateStatus('⚠️ 请先打开一个项目文件夹');
      statusBar.setStatus('error');
      vscode.window.showWarningMessage('请先在 VSCode 中打开一个项目文件夹');
      return;
    }

    const account: AccountData = {
      botToken: token.trim(),
      accountId: String(bot.id),
      baseUrl: telegramApiBaseUrl,
      userId: bot.username ?? String(bot.id),
      createdAt: new Date().toISOString(),
      channelType: 'telegram',
      boundCwd: cwd,
      telegramPollTimeout: telegramPollTimeout,
    };
    saveAccount(account);

    // Notify old channel if switching
    if (currentAccount && currentAccount.accountId !== account.accountId && currentAccount.channelType !== 'telegram') {
      try {
        const oldChannel = createWeChatChannel(currentAccount);
        const oldSender = oldChannel.getSender();
        await oldSender.sendText(currentAccount.userId, '', '⚠️ 检测到新的 Telegram 账号已绑定，当前连接已断开。');
      } catch {
        // best effort
      }
    }

    const lock = acquireInstanceLock(account.accountId);
    if (!lock) {
      vscode.window.showWarningMessage('⚠️ 另一个 VSCode 窗口已连接此 Telegram 账号，无法同时连接。');
      setUiState({ ...DISCONNECTED_STATE, channelName: 'Telegram', showRebind: true });
      statusBar.setStatus('disconnected');
      return;
    }
    currentLock = lock;

    startDaemon(account, cwd);
    vscode.window.showInformationMessage(`Telegram Bot @${bot.username} 连接成功！`);
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Telegram setup failed', { error: msg });

    if (msg.includes('401') || msg.includes('Unauthorized')) {
      setUiState({ ...DISCONNECTED_STATE, status: '❌ Token 无效或已过期', dotClass: 'error', channelName: 'Telegram', showRebind: true });
      statusBar.setStatus('error');
      vscode.window.showErrorMessage('Telegram Token 无效，请检查后重试。');
    } else {
      setUiState({ ...DISCONNECTED_STATE, status: '❌ 绑定失败: ' + msg, dotClass: 'error', channelName: 'Telegram', showRebind: true });
      statusBar.setStatus('error');
      vscode.window.showErrorMessage('Telegram 绑定失败: ' + msg);
    }
  }
}

async function doQrBind(): Promise<void> {
  if (qrBindAbort) {
    qrBindAbort.abort();
  }
  const abort = new AbortController();
  qrBindAbort = abort;

  statusBar.setStatus('connecting');
  updateStatus('正在生成二维码，请稍候...');

  try {
    const { qrcodeUrl, qrcodeId } = await startQrLogin();
    if (abort.signal.aborted) { qrBindAbort = null; return; }

    const dataUri = await QRCode.toDataURL(qrcodeUrl, { width: 300, margin: 2 });
    if (abort.signal.aborted) { qrBindAbort = null; return; }

    showQrCode(dataUri);
    statusBar.setStatus('scanning');

    const account = await waitForQrScan(qrcodeId, abort.signal);
    if (abort.signal.aborted) { qrBindAbort = null; return; }

    // Notify old user that connection is being replaced
    if (currentAccount && currentAccount.accountId !== account.accountId) {
      try {
        const oldChannel = createWeChatChannel(currentAccount);
        const oldSender = oldChannel.getSender();
        await oldSender.sendText(
          currentAccount.userId,
          '',
          '⚠️ 检测到新的微信账号已绑定，当前连接已断开。',
        );
        logger.info('Notified old account of disconnect', {
          oldAccountId: currentAccount.accountId,
          newAccountId: account.accountId,
        });
      } catch (notifyErr) {
        logger.warn('Failed to notify old account', {
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }
    }

    hideQrCode();
    const cwd = getWorkspaceCwd();
    if (!cwd) {
      updateStatus('⚠️ 请先打开一个项目文件夹');
      statusBar.setStatus('error');
      return;
    }

    account.boundCwd = cwd;
    account.channelType = 'wechat';
    saveAccount(account);

    const lock = acquireInstanceLock(account.accountId);
    if (!lock) {
      vscode.window.showWarningMessage(`⚠️ 另一个 VSCode 窗口已连接此账号，无法同时连接。`);
      setUiState({ ...DISCONNECTED_STATE, channelName: '微信', showRebind: true });
      statusBar.setStatus('disconnected');
      return;
    }
    currentLock = lock;

    startDaemon(account, cwd);
    vscode.window.showInformationMessage('微信绑定成功！');
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('QR bind failed', { error: msg });

    if (msg.includes('expired')) {
      setUiState({ ...DISCONNECTED_STATE, channelName: '微信', showRebind: true });
      statusBar.setStatus('disconnected');
      vscode.window.showWarningMessage('二维码已过期，请重试。');
    } else if (msg.includes('cancelled')) {
      setUiState({ ...DISCONNECTED_STATE, channelName: '微信', showRebind: true });
      statusBar.setStatus('disconnected');
    } else {
      setUiState({ ...DISCONNECTED_STATE, status: '❌ 绑定失败: ' + msg, dotClass: 'error', channelName: '微信', showRebind: true });
      statusBar.setStatus('error');
      vscode.window.showErrorMessage('微信绑定失败: ' + msg);
    }
  }
}

function stopDaemon(): void {
  if (activeChannel) {
    activeChannel.stop();
    activeChannel = undefined;
  }
  currentAccount = undefined;
  currentCwd = undefined;
  currentSession = undefined;
  currentSessionStore = undefined;
}

// ========== Daemon ==========

function startDaemon(account: AccountData, cwd: string): void {
  stopDaemon();

  // Create channel based on account type
  let channel: Channel;
  if (account.channelType === 'telegram') {
    const config = vscode.workspace.getConfiguration('codeClaw');
    const baseUrl = account.baseUrl || config.get<string>('telegramApiBaseUrl', 'https://api.telegram.org');
    const pollTimeout = account.telegramPollTimeout || config.get<number>('telegramPollTimeout', 30);
    channel = createTelegramChannel(account.botToken, { baseUrl, pollTimeout });
    channel = { ...channel, accountId: account.accountId, userId: account.userId };
  } else {
    channel = createWeChatChannel(account);
  }
  const sessionStore = createSessionStore();
  const session: Session = sessionStore.load(account.accountId);

  const effectiveCwd = cwd || process.cwd();
  if (session.workingDirectory !== effectiveCwd) {
    session.workingDirectory = effectiveCwd;
    sessionStore.save(account.accountId, session);
  }

  currentAccount = account;
  currentCwd = effectiveCwd;
  currentSession = session;
  currentSessionStore = sessionStore;

  const sender = channel.getSender();
  const sharedCtx = { lastContextToken: '' };

  const callbacks: ChannelCallbacks = {
    onMessage: async (msg: ChannelMessage) => {
      await handleMessage(msg, sender, sharedCtx);
    },
    onSessionExpired: () => {
      const name = channel.displayName;
      logger.warn('Session expired');
      setUiState({ ...DISCONNECTED_STATE, status: `⚠️ ${name}会话已过期，请重新绑定`, dotClass: 'error', channelName: name, showRebind: true });
      statusBar.setStatus('error');
      vscode.window.showWarningMessage(`${name}会话已过期，请重新扫码绑定。`);
    },
  };

  activeChannel = channel;
  statusBar.setChannelName(channelName());
  statusBar.setStatus('connected');
  setUiState(connectedState(cwd, channelName()));
  _processingLock = Promise.resolve();
  logger.info('Daemon started', { channel: channel.channelType, accountId: channel.accountId, cwd });

  channel.start(callbacks);
}

// ========== Message Handler ==========

let _processingLock: Promise<void> = Promise.resolve();

async function handleMessage(
  msg: ChannelMessage,
  sender: ChannelSender,
  sharedCtx: { lastContextToken: string },
): Promise<void> {
  if (!currentAccount || !currentSession || !currentSessionStore) { return; }

  const account = currentAccount;
  const session = currentSession;
  const sessionStore = currentSessionStore;
  const cwd = currentCwd || session.workingDirectory;

  const fromUserId = msg.fromUserId;
  const contextToken = msg.contextToken;
  const userText = msg.text;
  const imageUrl = msg.imageUrl;
  sharedCtx.lastContextToken = contextToken;

  // Acquire processing lock
  let releaseLock: (() => void) | undefined;
  try {
    const prevLock = _processingLock;
    let resolver!: () => void;
    const currentLock = new Promise<void>(resolve => { resolver = resolve; });
    _processingLock = currentLock;
    releaseLock = resolver;
    await prevLock;
  } catch {
    return;
  }

  try {
    if (!currentAccount || currentAccount.accountId !== account.accountId || currentSession !== session) {
      return;
    }

    // Concurrency guard
    if (session.state === 'processing') {
      if (!userText.startsWith('/status') && !userText.startsWith('/help')) {
        await sender.sendText(fromUserId, contextToken, '⏳ 正在处理上一条消息，请稍后...');
        return;
      }
    }

    // Slash commands
    if (userText.startsWith('/')) {
      const cmdText = userText.trim();
      const spaceIdx = cmdText.indexOf(' ');
      const cmd = (spaceIdx === -1 ? cmdText.slice(1) : cmdText.slice(1, spaceIdx)).toLowerCase();
      const args = spaceIdx === -1 ? '' : cmdText.slice(spaceIdx + 1).trim();

      switch (cmd) {
        case 'help':
          await sender.sendText(fromUserId, contextToken, HELP_TEXT);
          return;
        case 'new': {
          const newSession = sessionStore.clear(account.accountId, session);
          Object.assign(session, newSession);
          await sender.sendText(fromUserId, contextToken, '✅ 已开启新会话。');
          return;
        }
        case 'cwd':
          if (!args) {
            await sender.sendText(fromUserId, contextToken, '当前工作目录: ' + (session.workingDirectory || cwd) + '\n用法: /cwd <路径>');
          } else {
            session.workingDirectory = args;
            currentCwd = args;
            sessionStore.save(account.accountId, session);
            await sender.sendText(fromUserId, contextToken, '✅ 工作目录已切换为: ' + args);
          }
          return;
        case 'model':
          if (!args) {
            await sender.sendText(fromUserId, contextToken, '用法: /model <模型名称>\n例: /model claude-sonnet-4-6');
          } else {
            session.model = args;
            sessionStore.save(account.accountId, session);
            await sender.sendText(fromUserId, contextToken, '✅ 模型已切换为: ' + args);
          }
          return;
        case 'mode':
          if (!args) {
            await sender.sendText(fromUserId, contextToken, [
              '当前权限模式: ' + (session.permissionMode || 'default'),
              '',
              '可用模式（名称或数字快捷键）:',
              '  0 / plan              仅规划不执行',
              '  1 / default            默认（逐次确认）',
              '  2 / acceptEdits        自动接受文件编辑',
              '  3 / bypassPermissions  跳过所有权限检查',
              '',
              '用法: /mode <模式名或数字>',
            ].join('\n'));
          } else {
            const numMap: Record<string, string> = {
              '0': 'plan', '1': 'default', '2': 'acceptEdits', '3': 'bypassPermissions',
              '4': 'bypassPermissions', '5': 'bypassPermissions',
            };
            const resolved = numMap[args.trim()] || args.trim();
            const validModes = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];
            if (!validModes.includes(resolved)) {
              await sender.sendText(fromUserId, contextToken, '❌ 无效模式: ' + args + '\n可用: 0(plan), 1(default), 2(acceptEdits), 3(bypassPermissions)');
            } else {
              session.permissionMode = resolved as Session['permissionMode'];
              sessionStore.save(account.accountId, session);
              await sender.sendText(fromUserId, contextToken, '✅ 权限模式已切换为: ' + resolved);
            }
          }
          return;
        case 'status': {
          const mode = session.permissionMode ?? 'default';
          const modeDesc: Record<string, string> = { 'default': '默认（逐次确认）', 'acceptEdits': '自动接受编辑', 'plan': '仅规划' };
          await sender.sendText(fromUserId, contextToken, [
            '📊 会话状态', '',
            '工作目录: ' + (session.workingDirectory || cwd),
            '模型: ' + (session.model || '默认'),
            '权限模式: ' + mode + '（' + (modeDesc[mode] || mode) + '）',
            '会话状态: ' + session.state,
            '连续会话: ' + (session.continuedSession ? '是' : '否'),
          ].join('\n'));
          return;
        }
        default:
          await sender.sendText(fromUserId, contextToken, '❓ 未知命令: /' + cmd + '\n输入 /help 查看可用命令');
          return;
      }
    }

    // Normal message -> Claude
    if (!userText && !imageUrl) {
      await sender.sendText(fromUserId, contextToken, '暂不支持此类型消息，请发送文字或图片');
      return;
    }

    logger.info('User message', { text: userText, hasImage: !!imageUrl, messageId: msg.id });

    if (userText) {
      reportPrompt(userText);
    }

    const streaming = vscode.workspace
      .getConfiguration('codeClaw')
      .get<boolean>('streaming', true);

    session.state = 'processing';
    sessionStore.save(account.accountId, session);
    statusBar.setStatus('processing');
    setUiState(processingState(channelName()));

    const checklistTracker = new ChecklistTracker(8);
    let checklistUpdateCount = 0;

    try {
      const queryOptions: QueryOptions = {
        prompt: userText || '请分析这张图片',
        cwd: session.workingDirectory || cwd || process.cwd(),
        resume: session.continuedSession ? session.sdkSessionId : undefined,
        model: session.model,
        permissionMode: session.permissionMode,
        streaming,
        onIntermediate: streaming
          ? async (msg) => {
              if (msg.displayText) {
                logger.info('Stream intermediate', {
                  type: msg.type,
                  preview: msg.displayText.substring(0, 50),
                });
              }

              if (msg.type === 'assistant' && msg.rawMessage) {
                const update = checklistTracker.checkUpdate(msg.rawMessage);
                if (update && checklistUpdateCount < 9) {
                  checklistUpdateCount++;
                  try {
                    await sender.sendText(fromUserId, contextToken, update);
                  } catch (sendErr) {
                    logger.error('Failed to send checklist update', {
                      error: sendErr instanceof Error ? sendErr.message : String(sendErr),
                    });
                  }
                }
              }
            }
          : undefined,
      };

      const result = await claudeQuery(queryOptions);

      if (result.sessionId) {
        session.sdkSessionId = result.sessionId;
        session.continuedSession = true;
        logger.info('Session resumed', { sessionId: result.sessionId });
      }

      if (result.error) {
        let errorMessage = '⚠️ Claude 处理请求时出错:\n' + result.error;
        if (result.text) {
          const finalText = plainText(result.text);
          errorMessage += '\n' + finalText;
        }
        logger.error('Claude query error', { error: errorMessage });
        await sender.sendText(fromUserId, contextToken, errorMessage);
      } else if (result.text) {
        let finalText = plainText(result.text);
        const MAX_MESSAGE_LENGTH = 1500;
        if (finalText.length > MAX_MESSAGE_LENGTH) {
          finalText = `**由于${channelName()}消息限制，以下是部分内容，完整内容请到VSCode查看**\n\n${finalText.slice(0, MAX_MESSAGE_LENGTH)}`;
        }
        await sender.sendText(fromUserId, contextToken, finalText);

        if (result.permissionDenials && result.permissionDenials.length > 0) {
          const deniedTools = result.permissionDenials.map(d => d.tool_name).filter(Boolean);
          const uniqueTools = [...new Set(deniedTools)];
          const currentMode = session.permissionMode ?? 'default';
          const tip = [
            '⚠️ 部分操作因权限限制未执行',
            '',
            '被拒绝的工具: ' + uniqueTools.join(', '),
            '',
            '当前权限模式: ' + currentMode,
            '',
            '如需自动授权，请发送:',
            '  /mode 2  (自动接受文件编辑)',
            '  /mode 3  (跳过所有权限检查)',
          ].join('\n');
          await sender.sendText(fromUserId, contextToken, tip);
        }
      } else {
        await sender.sendText(fromUserId, contextToken, 'ℹ️ Claude 无返回内容');
      }

      session.state = 'idle';
      sessionStore.save(account.accountId, session);
      statusBar.setStatus('connected');
      setUiState(connectedState(currentCwd || cwd, channelName()));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Error in handleMessage', { error: errorMsg });
      await sender.sendText(fromUserId, contextToken, '⚠️ 处理消息时出错，请稍后重试。');
      session.state = 'idle';
      sessionStore.save(account.accountId, session);
      statusBar.setStatus('connected');
      setUiState(connectedState(currentCwd || cwd, channelName()));
    }
  } finally {
    releaseLock?.();
  }
}
