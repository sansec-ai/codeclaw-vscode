import * as vscode from 'vscode';
import { initLogger, logger } from './logger';
import { WeChatPanel, WeChatSidebarProvider, DISCONNECTED_STATE, connectedState, processingState, type ViewState } from './panel';
import { StatusBarManager } from './statusbar';
import { WeChatApi } from './wechat/api';
import { loadLatestAccount, saveAccount, type AccountData } from './wechat/accounts';
import { startQrLogin, waitForQrScan } from './wechat/login';
import { createMonitor, type MonitorCallbacks } from './wechat/monitor';
import { createSender } from './wechat/send';
import { extractText, extractFirstImageUrl } from './wechat/media';
import { createSessionStore, type Session } from './session';
import { claudeQuery, type QueryOptions } from './claude/provider';
import { MessageType, type WeixinMessage } from './wechat/types';
import QRCode from 'qrcode';

const MAX_MESSAGE_LENGTH = 2048;

// ========== Global State ==========
let panelInstance: WeChatPanel | undefined;
let sidebarProvider: WeChatSidebarProvider;
let statusBar: StatusBarManager;
let monitorInstance: ReturnType<typeof createMonitor> | undefined;
let outputChannel: vscode.OutputChannel;
let extContext: vscode.ExtensionContext;

let currentAccount: AccountData | undefined;
let currentCwd: string | undefined;
let currentSession: Session | undefined;
let currentSessionStore: ReturnType<typeof createSessionStore> | undefined;

// ========== Helpers ==========

function splitMessage(text: string, maxLen: number = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLen) { return [text]; }
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let splitIdx = remaining.lastIndexOf('\n', maxLen);
    if (splitIdx < maxLen * 0.3) { splitIdx = maxLen; }
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n+/, '');
  }
  return chunks;
}

function extractTextFromItems(items: NonNullable<WeixinMessage['item_list']>): string {
  return items.map((item) => extractText(item)).filter(Boolean).join('\n');
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
  '  /cwd <路径>       切换工作目录',
  '  /model <名称>     切换 Claude 模型',
  '  /mode <模式>      切换权限模式 (default/acceptEdits/plan)',
  '  /status           查看当前会话状态',
  '',
  '直接输入文字即可与 Claude Code 对话（连续会话）',
].join('\n');

// ========== Activate / Deactivate ==========

export async function activate(ctx: vscode.ExtensionContext) {
  extContext = ctx;
  outputChannel = vscode.window.createOutputChannel('WeChat Claude Code');
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
    vscode.commands.registerCommand('wechat-vscode.connect', () => handleConnect()),
    vscode.commands.registerCommand('wechat-vscode.disconnect', () => handleDisconnect()),
    vscode.commands.registerCommand('wechat-vscode.showPanel', () => showOrCreatePanel()),
  );

  logger.info('WeChat VSCode extension activated');

  // Auto-reconnect if account already bound
  const account = loadLatestAccount();
  if (account) {
    const cwd = getWorkspaceCwd();
    if (cwd) {
      // Start daemon silently, update UI to connected state
      startDaemon(account, cwd);
      logger.info('Auto-reconnected on activation', { accountId: account.accountId });
    }
  }
}

export function deactivate() {
  if (monitorInstance) {
    monitorInstance.stop();
    monitorInstance = undefined;
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
    ? connectedState(currentCwd || '无工作目录')
    : DISCONNECTED_STATE;
  panelInstance = WeChatPanel.createOrShow(extContext.extensionUri, state);
  panelInstance.onDidDispose(() => { panelInstance = undefined; });
  extContext.subscriptions.push(panelInstance);
}

// ========== Connect / Disconnect / Rebind ==========

/**
 * Connect: if already bound, start daemon directly; otherwise show QR.
 */
async function handleConnect(): Promise<void> {
  const existingAccount = loadLatestAccount();
  if (existingAccount) {
    // Already bound — start daemon directly
    const cwd = getWorkspaceCwd();
    if (!cwd) {
      vscode.window.showWarningMessage('请先在 VSCode 中打开一个项目文件夹');
      return;
    }
    if (currentAccount && monitorInstance) {
      // Already running
      vscode.window.showInformationMessage('微信已连接，无需重复连接。');
      return;
    }
    startDaemon(existingAccount, cwd);
    vscode.window.showInformationMessage('微信已连接！');
    return;
  }

  // Not bound — show QR code
  await doQrBind();
}

/** Disconnect but keep account data for next quick-connect. */
function handleDisconnect(): void {
  stopDaemon();
  setUiState(DISCONNECTED_STATE);
  statusBar.setStatus('disconnected');
  vscode.window.showInformationMessage('微信已断开连接。下次点击"连接微信"可直接恢复。');
  logger.info('Disconnected by user');
}

/** Disconnect and rebind with new QR code. */
async function handleRebind(): Promise<void> {
  stopDaemon();
  setUiState(DISCONNECTED_STATE);
  await doQrBind();
}

async function doQrBind(): Promise<void> {
  statusBar.setStatus('connecting');
  updateStatus('正在生成二维码，请稍候...');

  try {
    const { qrcodeUrl, qrcodeId } = await startQrLogin();
    const dataUri = await QRCode.toDataURL(qrcodeUrl, { width: 300, margin: 2 });

    showQrCode(dataUri);
    statusBar.setStatus('scanning');

    const abortController = new AbortController();

    const account = await waitForQrScan(qrcodeId, abortController.signal);

    // Save account for future quick-connect
    saveAccount(account);

    hideQrCode();
    const cwd = getWorkspaceCwd();
    if (!cwd) {
      updateStatus('⚠️ 请先打开一个项目文件夹');
      statusBar.setStatus('error');
      return;
    }

    startDaemon(account, cwd);
    vscode.window.showInformationMessage('微信绑定成功！');
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('QR bind failed', { error: msg });

    if (msg.includes('expired')) {
      setUiState(DISCONNECTED_STATE);
      statusBar.setStatus('disconnected');
      vscode.window.showWarningMessage('二维码已过期，请重试。');
    } else if (msg.includes('cancelled')) {
      setUiState(DISCONNECTED_STATE);
      statusBar.setStatus('disconnected');
    } else {
      setUiState({ ...DISCONNECTED_STATE, status: '❌ 绑定失败: ' + msg, dotClass: 'error' });
      statusBar.setStatus('error');
      vscode.window.showErrorMessage('微信绑定失败: ' + msg);
    }
  }
}

function stopDaemon(): void {
  if (monitorInstance) {
    monitorInstance.stop();
    monitorInstance = undefined;
  }
  currentAccount = undefined;
  currentCwd = undefined;
  currentSession = undefined;
  currentSessionStore = undefined;
}

// ========== Daemon ==========

function startDaemon(account: AccountData, cwd: string): void {
  if (monitorInstance) {
    monitorInstance.stop();
    monitorInstance = undefined;
  }

  const api = new WeChatApi(account.botToken, account.baseUrl);
  const sessionStore = createSessionStore();
  const session: Session = sessionStore.load(account.accountId);

  if (cwd && session.workingDirectory !== cwd) {
    session.workingDirectory = cwd;
    sessionStore.save(account.accountId, session);
  }

  currentAccount = account;
  currentCwd = cwd;
  currentSession = session;
  currentSessionStore = sessionStore;

  const sender = createSender(api, account.accountId);
  const sharedCtx = { lastContextToken: '' };

  const callbacks: MonitorCallbacks = {
    onMessage: async (msg: WeixinMessage) => {
      await handleMessage(msg, sender, sharedCtx);
    },
    onSessionExpired: () => {
      logger.warn('Session expired');
      setUiState({ ...DISCONNECTED_STATE, status: '⚠️ 微信会话已过期，请重新绑定', dotClass: 'error' });
      statusBar.setStatus('error');
      vscode.window.showWarningMessage('微信会话已过期，请重新扫码绑定。');
    },
  };

  monitorInstance = createMonitor(api, callbacks);
  statusBar.setStatus('connected');
  setUiState(connectedState(cwd));
  logger.info('Daemon started', { accountId: account.accountId, cwd });

  monitorInstance.run().catch((err) => {
    logger.error('Monitor crashed', { error: err instanceof Error ? err.message : String(err) });
    setUiState({ ...DISCONNECTED_STATE, status: '❌ 连接断开', dotClass: 'error' });
    statusBar.setStatus('error');
  });
}

// ========== Message Handler ==========

async function handleMessage(
  msg: WeixinMessage,
  sender: ReturnType<typeof createSender>,
  sharedCtx: { lastContextToken: string },
): Promise<void> {
  if (!currentAccount || !currentSession || !currentSessionStore) { return; }

  const account = currentAccount;
  const session = currentSession;
  const sessionStore = currentSessionStore;
  const cwd = currentCwd || session.workingDirectory;

  if (msg.message_type !== MessageType.USER) { return; }
  if (!msg.from_user_id || !msg.item_list) { return; }

  const contextToken = msg.context_token ?? '';
  const fromUserId = msg.from_user_id;
  sharedCtx.lastContextToken = contextToken;

  const userText = extractTextFromItems(msg.item_list);
  const imageItem = extractFirstImageUrl(msg.item_list);

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
            '', '可用模式:',
            '  default      默认（逐次确认）',
            '  acceptEdits  自动接受文件编辑',
            '  plan         仅规划不执行',
            '', '用法: /mode <模式名>',
          ].join('\n'));
        } else {
          const validModes = ['default', 'acceptEdits', 'plan'];
          if (!validModes.includes(args)) {
            await sender.sendText(fromUserId, contextToken, '❌ 无效模式: ' + args + '\n可用: default, acceptEdits, plan');
          } else {
            session.permissionMode = args as Session['permissionMode'];
            sessionStore.save(account.accountId, session);
            await sender.sendText(fromUserId, contextToken, '✅ 权限模式已切换为: ' + args);
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
        break;
    }
  }

  // Normal message -> Claude
  if (!userText && !imageItem) {
    await sender.sendText(fromUserId, contextToken, '暂不支持此类型消息，请发送文字或图片');
    return;
  }

  session.state = 'processing';
  sessionStore.save(account.accountId, session);
  statusBar.setStatus('processing');
  setUiState(processingState());

  try {
    const queryOptions: QueryOptions = {
      prompt: userText || '请分析这张图片',
      cwd: session.workingDirectory || cwd,
      continueSession: session.continuedSession,
      model: session.model,
      permissionMode: session.permissionMode,
    };

    const result = await claudeQuery(queryOptions);

    if (result.error) {
      logger.error('Claude query error', { error: result.error });
      await sender.sendText(fromUserId, contextToken, '⚠️ Claude 处理请求时出错:\n' + result.error);
    } else if (result.text) {
      const chunks = splitMessage(result.text);
      for (const chunk of chunks) {
        await sender.sendText(fromUserId, contextToken, chunk);
      }
    } else {
      await sender.sendText(fromUserId, contextToken, 'ℹ️ Claude 无返回内容');
    }

    session.continuedSession = true;
    session.state = 'idle';
    sessionStore.save(account.accountId, session);
    statusBar.setStatus('connected');
    setUiState(connectedState(currentCwd || cwd));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Error in handleMessage', { error: errorMsg });
    await sender.sendText(fromUserId, contextToken, '⚠️ 处理消息时出错，请稍后重试。');
    session.state = 'idle';
    sessionStore.save(account.accountId, session);
    statusBar.setStatus('connected');
    setUiState(connectedState(currentCwd || cwd));
  }
}
