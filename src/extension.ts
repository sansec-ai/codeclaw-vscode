import * as vscode from 'vscode';
import { initLogger, logger } from './logger';
import { WeChatPanel } from './panel';
import { StatusBarManager } from './statusbar';
import { WeChatApi } from './wechat/api';
import { loadLatestAccount, type AccountData } from './wechat/accounts';
import { createMonitor, type MonitorCallbacks } from './wechat/monitor';
import { createSender } from './wechat/send';
import { extractText, extractFirstImageUrl } from './wechat/media';
import { createSessionStore, type Session } from './session';
import { claudeQuery, type QueryOptions } from './claude/provider';
import { MessageType, type WeixinMessage } from './wechat/types';

const MAX_MESSAGE_LENGTH = 2048;

let panelInstance: WeChatPanel | undefined;
let statusBar: StatusBarManager;
let monitorInstance: ReturnType<typeof createMonitor> | undefined;
let outputChannel: vscode.OutputChannel;
let extContext: vscode.ExtensionContext;

function splitMessage(text: string, maxLen: number = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLen) { return [text]; }
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
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

const HELP_TEXT = [
  '可用命令：',
  '',
  '  /help             显示帮助',
  '  /clear            清除当前会话',
  '  /cwd <路径>       切换工作目录',
  '  /model <名称>     切换 Claude 模型',
  '  /status           查看当前会话状态',
  '',
  '直接输入文字即可与 Claude Code 对话',
].join('\n');

export async function activate(ctx: vscode.ExtensionContext) {
  extContext = ctx;
  outputChannel = vscode.window.createOutputChannel('WeChat Claude Code');
  ctx.subscriptions.push(outputChannel);
  initLogger(outputChannel);

  statusBar = new StatusBarManager();
  ctx.subscriptions.push(statusBar);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wechat-vscode.connect', () => startConnect()),
    vscode.commands.registerCommand('wechat-vscode.disconnect', () => doDisconnect()),
    vscode.commands.registerCommand('wechat-vscode.showPanel', () => showOrCreatePanel()),
  );

  logger.info('WeChat VSCode extension activated');

  // Auto-reconnect if account exists
  const account = loadLatestAccount();
  if (account) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const cwd = workspaceFolders && workspaceFolders.length > 0
      ? workspaceFolders[0].uri.fsPath : undefined;
    if (cwd) {
      startDaemon(account, cwd);
    }
  }
}

function showOrCreatePanel(): void {
  if (panelInstance) {
    panelInstance.reveal();
    return;
  }
  panelInstance = WeChatPanel.createOrShow(extContext.extensionUri);
  panelInstance.onDidDispose(() => {
    panelInstance = undefined;
  });
  extContext.subscriptions.push(panelInstance);
}

async function startConnect(): Promise<void> {
  showOrCreatePanel();
  if (!panelInstance) { return; }

  statusBar.setStatus('connecting');
  panelInstance.updateStatus('正在生成二维码...');

  try {
    const { startQrLogin, waitForQrScan } = await import('./wechat/login');
    const { qrcodeUrl, qrcodeId } = await startQrLogin();

    const QRCode = await import('qrcode');
    const dataUri = await QRCode.toDataURL(qrcodeUrl, { width: 300, margin: 2 });

    panelInstance.showQrCode(dataUri);
    panelInstance.updateStatus('请用微信扫描二维码绑定...');
    statusBar.setStatus('scanning');

    const abortController = new AbortController();
    panelInstance.onDidDispose(() => { abortController.abort(); });

    const account = await waitForQrScan(qrcodeId, abortController.signal);

    panelInstance.updateStatus('✅ 绑定成功！正在启动消息监听...');
    statusBar.setStatus('connected');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      panelInstance.updateStatus('⚠️ 没有打开的工作区，请先打开一个项目文件夹');
      statusBar.setStatus('error');
      return;
    }

    const cwd = workspaceFolders[0].uri.fsPath;
    panelInstance.updateStatus('✅ 已连接！工作目录: ' + cwd);
    panelInstance.hideQrCode();
    startDaemon(account, cwd);

    vscode.window.showInformationMessage('微信已连接成功！可以在微信中发送消息来操作项目。');
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Connect failed', { error: msg });

    if (msg.includes('expired')) {
      panelInstance.updateStatus('⚠️ 二维码已过期，请重新连接');
      statusBar.setStatus('disconnected');
      vscode.window.showWarningMessage('二维码已过期，请重新点击连接。');
    } else if (msg.includes('cancelled')) {
      statusBar.setStatus('disconnected');
    } else {
      panelInstance.updateStatus('❌ 连接失败: ' + msg);
      statusBar.setStatus('error');
      vscode.window.showErrorMessage('微信连接失败: ' + msg);
    }
  }
}

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

  const sender = createSender(api, account.accountId);
  const sharedCtx = { lastContextToken: '' };

  const callbacks: MonitorCallbacks = {
    onMessage: async (msg: WeixinMessage) => {
      await handleMessage(msg, account, session, sessionStore, sender, cwd, sharedCtx);
    },
    onSessionExpired: () => {
      logger.warn('Session expired');
      statusBar.setStatus('error');
      panelInstance?.updateStatus('⚠️ 微信会话已过期，请重新连接');
      vscode.window.showWarningMessage('微信会话已过期，请重新扫码绑定。');
    },
  };

  monitorInstance = createMonitor(api, callbacks);
  statusBar.setStatus('connected');
  logger.info('Daemon started', { accountId: account.accountId, cwd });

  monitorInstance.run().catch((err) => {
    logger.error('Monitor crashed', { error: err instanceof Error ? err.message : String(err) });
    statusBar.setStatus('error');
  });
}

async function handleMessage(
  msg: WeixinMessage,
  account: AccountData,
  session: Session,
  sessionStore: ReturnType<typeof createSessionStore>,
  sender: ReturnType<typeof createSender>,
  cwd: string,
  sharedCtx: { lastContextToken: string },
): Promise<void> {
  if (msg.message_type !== MessageType.USER) { return; }
  if (!msg.from_user_id || !msg.item_list) { return; }

  const contextToken = msg.context_token ?? '';
  const fromUserId = msg.from_user_id;
  sharedCtx.lastContextToken = contextToken;

  const userText = extractTextFromItems(msg.item_list);
  const imageItem = extractFirstImageUrl(msg.item_list);

  // Concurrency guard
  if (session.state === 'processing') {
    if (userText.startsWith('/clear')) {
      await sender.sendText(fromUserId, contextToken, '⏳ 正在处理上一条消息，请稍后再清除会话');
    } else if (!userText.startsWith('/')) {
      await sender.sendText(fromUserId, contextToken, '⏳ 正在处理上一条消息，请稍后...');
    }
    if (!userText.startsWith('/status') && !userText.startsWith('/help')) { return; }
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
      case 'clear':
        session.state = 'idle';
        sessionStore.clear(account.accountId, session);
        Object.assign(session, sessionStore.load(account.accountId));
        await sender.sendText(fromUserId, contextToken, '✅ 会话已清除。');
        return;
      case 'cwd':
        if (!args) {
          await sender.sendText(fromUserId, contextToken, '当前工作目录: ' + session.workingDirectory + '\n用法: /cwd <路径>');
        } else {
          session.workingDirectory = args;
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
      case 'status': {
        const mode = session.permissionMode ?? 'default';
        const statusText = [
          '📊 会话状态', '',
          '工作目录: ' + session.workingDirectory,
          '模型: ' + (session.model ?? '默认'),
          '权限模式: ' + mode,
          '状态: ' + session.state,
        ].join('\n');
        await sender.sendText(fromUserId, contextToken, statusText);
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
  panelInstance?.updateStatus('⏳ 正在处理消息...');

  try {
    const queryOptions: QueryOptions = {
      prompt: userText || '请分析这张图片',
      cwd: session.workingDirectory || cwd,
      resume: session.sdkSessionId,
      model: session.model,
      permissionMode: session.permissionMode,
    };

    const result = await claudeQuery(queryOptions);

    if (result.error) {
      logger.error('Claude query error', { error: result.error });
      await sender.sendText(fromUserId, contextToken, '⚠️ Claude 处理请求时出错，请稍后重试。');
    } else if (result.text) {
      const chunks = splitMessage(result.text);
      for (const chunk of chunks) {
        await sender.sendText(fromUserId, contextToken, chunk);
      }
    } else {
      await sender.sendText(fromUserId, contextToken, 'ℹ️ Claude 无返回内容');
    }

    session.sdkSessionId = result.sessionId || undefined;
    session.state = 'idle';
    sessionStore.save(account.accountId, session);
    statusBar.setStatus('connected');
    panelInstance?.updateStatus('✅ 已连接，等待消息...');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Error in handleMessage', { error: errorMsg });
    await sender.sendText(fromUserId, contextToken, '⚠️ 处理消息时出错，请稍后重试。');
    session.state = 'idle';
    sessionStore.save(account.accountId, session);
    statusBar.setStatus('connected');
    panelInstance?.updateStatus('✅ 已连接，等待消息...');
  }
}

function doDisconnect(): void {
  if (monitorInstance) {
    monitorInstance.stop();
    monitorInstance = undefined;
  }
  statusBar.setStatus('disconnected');
  panelInstance?.updateStatus('已断开连接');
  panelInstance?.hideQrCode();
  panelInstance?.showConnectButton();
  vscode.window.showInformationMessage('微信已断开连接。');
  logger.info('Disconnected by user');
}

export function deactivate() {
  if (monitorInstance) {
    monitorInstance.stop();
    monitorInstance = undefined;
  }
  if (outputChannel) {
    outputChannel.dispose();
  }
  logger.info('Extension deactivated');
}
