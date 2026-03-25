import * as vscode from 'vscode';
import { initLogger, logger } from './logger';
import { WeChatPanel, WeChatSidebarProvider, DISCONNECTED_STATE, connectedState, processingState, type ViewState } from './panel';
import { StatusBarManager } from './statusbar';
import { WeChatApi } from './wechat/api';
import { loadLatestAccount, saveAccount, deleteAccount, type AccountData } from './wechat/accounts';
import { startQrLogin, waitForQrScan } from './wechat/login';
import { createMonitor, type MonitorCallbacks } from './wechat/monitor';
import { createSender } from './wechat/send';
import { extractText, extractFirstImageUrl } from './wechat/media';
import { createSessionStore, type Session } from './session';
import { claudeQuery, type QueryOptions, plainText } from './claude/provider';
import { ChecklistTracker } from './claude/checklist-tracker';
import { MessageType, type WeixinMessage } from './wechat/types';
import { reportPrompt } from './stats';
import { acquireInstanceLock, releaseInstanceLock } from './store';
import type { LockHandle } from './store';
import QRCode from 'qrcode';

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
let qrBindAbort: AbortController | null = null;
let currentLock: LockHandle | null = null;

// ========== Helpers ==========



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

  // Auto-reconnect if account already bound AND workspace matches
  const account = loadLatestAccount();
  if (account) {
    const cwd = getWorkspaceCwd();
    if (!cwd) {
      logger.info('No workspace open, skipping auto-reconnect');
      statusBar.setStatus('disconnected');
    } else if (account.boundCwd && account.boundCwd !== cwd) {
      // Bound to a different project directory — don't connect
      logger.info('Workspace mismatch, skipping auto-reconnect', {
        boundCwd: account.boundCwd,
        currentCwd: cwd,
      });
      statusBar.setStatus('disconnected');
      setUiState({
        ...DISCONNECTED_STATE,
        status: `⚠️ 微信已绑定到其他项目: ${account.boundCwd}`,
        dotClass: 'disconnected',
        showConnect: false,
        showDisconnect: true,
        showQr: false,
      });
    } else {
      // Workspace matches (or no boundCwd recorded) — auto-connect
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
        startDaemon(account, cwd);
        logger.info('Auto-reconnected on activation', { accountId: account.accountId });
      }
    }
  }
}

export function deactivate() {
  if (monitorInstance) {
    monitorInstance.stop();
    monitorInstance = undefined;
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
    const cwd = getWorkspaceCwd();
    if (!cwd) {
      vscode.window.showWarningMessage('请先在 VSCode 中打开一个项目文件夹');
      return;
    }
    if (currentAccount && monitorInstance) {
      vscode.window.showInformationMessage('微信已连接，无需重复连接。');
      return;
    }
    // Check workspace match
    if (existingAccount.boundCwd && existingAccount.boundCwd !== cwd) {
      vscode.window.showWarningMessage(
        `⚠️ 微信已绑定到其他项目目录:\n${existingAccount.boundCwd}\n\n请在该项目中使用微信，或点击"重新绑定"。`
      );
      return;
    }
    // Try to acquire instance lock
    const lock = acquireInstanceLock(existingAccount.accountId);
    if (!lock) {
      vscode.window.showWarningMessage('⚠️ 另一个 VSCode 窗口已连接此微信账号，请先断开该窗口。');
      return;
    }
    currentLock = lock;
    startDaemon(existingAccount, cwd);
    vscode.window.showInformationMessage('微信已连接！');
    return;
  }

  // Not bound — show QR code
  await doQrBind();
}

/** Disconnect but keep account data for next quick-connect. */
function handleDisconnect(): void {
  // Cancel any pending QR bind flow
  if (qrBindAbort) {
    qrBindAbort.abort();
    qrBindAbort = null;
  }

  const accountId = currentAccount?.accountId;
  stopDaemon();
  // Release instance lock
  if (currentLock) {
    releaseInstanceLock(currentLock);
    currentLock = null;
  }
  // Delete saved account so next "Connect" requires rebind
  if (accountId) {
    deleteAccount(accountId);
  }
  setUiState(DISCONNECTED_STATE);
  statusBar.setStatus('disconnected');
  vscode.window.showInformationMessage('微信已断开连接，绑定已取消。下次点击"连接微信"需要重新扫码绑定。');
  logger.info('Disconnected by user, account deleted', { accountId });
}

/** Disconnect and rebind with new QR code. */
async function handleRebind(): Promise<void> {
  // Cancel any pending QR bind flow
  if (qrBindAbort) {
    qrBindAbort.abort();
    qrBindAbort = null;
  }
  stopDaemon();
  setUiState(DISCONNECTED_STATE);
  await doQrBind();
}

async function doQrBind(): Promise<void> {
  // Cancel any previous QR bind
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

    // Notify old WeChat user that connection is being replaced (if applicable)
    if (currentAccount && currentAccount.accountId !== account.accountId) {
      try {
        const oldApi = new WeChatApi(currentAccount.botToken, currentAccount.baseUrl);
        const oldSender = createSender(oldApi, currentAccount.accountId);
        // Use the last known context token if available
        const oldSharedCtx = { lastContextToken: '' };
        await oldSender.sendText(
          currentAccount.userId,
          oldSharedCtx.lastContextToken,
          '⚠️ 检测到新的微信账号已绑定，当前连接已断开。',
        );
        logger.info('Notified old account of disconnect', {
          oldAccountId: currentAccount.accountId,
          newAccountId: account.accountId,
        });
      } catch (notifyErr) {
        // Best effort — don't block the new connection
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

    // Save account with bound cwd for project-level exclusivity
    account.boundCwd = cwd;
    saveAccount(account);

    // Acquire instance lock before starting daemon
    const lock = acquireInstanceLock(account.accountId);
    if (!lock) {
      vscode.window.showWarningMessage('⚠️ 另一个 VSCode 窗口已连接此微信账号，无法同时连接。');
      setUiState(DISCONNECTED_STATE);
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
  // Note: do NOT clear qrBindAbort here — let handleDisconnect/handleRebind manage it
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

  const effectiveCwd = cwd || process.cwd();
  if (session.workingDirectory !== effectiveCwd) {
    session.workingDirectory = effectiveCwd;
    sessionStore.save(account.accountId, session);
  }

  currentAccount = account;
  currentCwd = effectiveCwd;
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
  // Reset processing lock so the new daemon can process messages
  _processingLock = Promise.resolve();
  logger.info('Daemon started', { accountId: account.accountId, cwd });

  monitorInstance.run().catch((err) => {
    logger.error('Monitor crashed', { error: err instanceof Error ? err.message : String(err) });
    setUiState({ ...DISCONNECTED_STATE, status: '❌ 连接断开', dotClass: 'error' });
    statusBar.setStatus('error');
  });
}

// ========== Message Handler ==========

// Module-level processing lock: prevents concurrent handleMessage execution
// even if multiple monitor instances are running simultaneously
let _processingLock: Promise<void> = Promise.resolve();

async function handleMessage(
  msg: WeixinMessage,
  sender: ReturnType<typeof createSender>,
  sharedCtx: { lastContextToken: string },
): Promise<void> {
  if (!currentAccount || !currentSession || !currentSessionStore) { return; }

  if (msg.message_type !== MessageType.USER) { return; }
  if (!msg.from_user_id || !msg.item_list) { return; }

  const account = currentAccount;
  const session = currentSession;
  const sessionStore = currentSessionStore;
  const cwd = currentCwd || session.workingDirectory;

  const contextToken = msg.context_token ?? '';
  const fromUserId = msg.from_user_id;
  sharedCtx.lastContextToken = contextToken;

  const userText = extractTextFromItems(msg.item_list);
  const imageItem = extractFirstImageUrl(msg.item_list);

  // Acquire processing lock — only one message processed at a time across all monitors
  let releaseLock: (() => void) | undefined;
  try {
    const prevLock = _processingLock;
    let resolver!: () => void;
    const currentLock = new Promise<void>(resolve => { resolver = resolve; });
    _processingLock = currentLock;
    releaseLock = resolver;

    // Wait for previous processing to finish
    await prevLock;
  } catch {
    return;
  }

  try {
    // Double-check session is still valid after waiting for lock
    if (!currentAccount || currentAccount.accountId !== account.accountId || currentSession !== session) {
      return;
    }

    // Concurrency guard via session state
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
    if (!userText && !imageItem) {
      await sender.sendText(fromUserId, contextToken, '暂不支持此类型消息，请发送文字或图片');
      return;
    }

    logger.info('User message', { text: userText, hasImage: !!imageItem, messageId: msg.message_id });

    // Stats reporting (fire-and-forget, no-op in default build)
    if (userText) {
      reportPrompt(userText);
    }

    // Read streaming config
    const streaming = vscode.workspace
      .getConfiguration('wechat-vscode')
      .get<boolean>('streaming', true);

    session.state = 'processing';
    sessionStore.save(account.accountId, session);
    statusBar.setStatus('processing');
    setUiState(processingState());

    // Checklist tracker: monitors TodoWrite tool calls and sends progress to WeChat
    const checklistTracker = new ChecklistTracker(8); // max 8 updates (reserve 2 for safety margin)
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
              // Log all intermediate messages
              if (msg.displayText) {
                logger.info('Stream intermediate', {
                  type: msg.type,
                  preview: msg.displayText.substring(0, 200),
                });
              }

              // Check for checklist updates from assistant messages
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
        logger.error('Claude query error', { error: result.error });
        await sender.sendText(fromUserId, contextToken, '⚠️ Claude 处理请求时出错:\n' + result.error);
      } else if (result.text) {
        // Send the full result as a single message, no splitting
        const finalText = plainText(result.text);
        await sender.sendText(fromUserId, contextToken, finalText);

        // If there were permission denials, append a warning
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
  } finally {
    // Always release the lock
    releaseLock?.();
  }
}
