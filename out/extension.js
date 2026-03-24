"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const logger_1 = require("./logger");
const panel_1 = require("./panel");
const statusbar_1 = require("./statusbar");
const api_1 = require("./wechat/api");
const accounts_1 = require("./wechat/accounts");
const monitor_1 = require("./wechat/monitor");
const send_1 = require("./wechat/send");
const media_1 = require("./wechat/media");
const session_1 = require("./session");
const provider_1 = require("./claude/provider");
const types_1 = require("./wechat/types");
const MAX_MESSAGE_LENGTH = 2048;
let panelInstance;
let statusBar;
let monitorInstance;
let outputChannel;
let extContext;
function splitMessage(text, maxLen = MAX_MESSAGE_LENGTH) {
    if (text.length <= maxLen) {
        return [text];
    }
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }
        let splitIdx = remaining.lastIndexOf('\n', maxLen);
        if (splitIdx < maxLen * 0.3) {
            splitIdx = maxLen;
        }
        chunks.push(remaining.slice(0, splitIdx));
        remaining = remaining.slice(splitIdx).replace(/^\n+/, '');
    }
    return chunks;
}
function extractTextFromItems(items) {
    return items.map((item) => (0, media_1.extractText)(item)).filter(Boolean).join('\n');
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
async function activate(ctx) {
    extContext = ctx;
    outputChannel = vscode.window.createOutputChannel('WeChat Claude Code');
    ctx.subscriptions.push(outputChannel);
    (0, logger_1.initLogger)(outputChannel);
    statusBar = new statusbar_1.StatusBarManager();
    ctx.subscriptions.push(statusBar);
    ctx.subscriptions.push(vscode.commands.registerCommand('wechat-vscode.connect', () => startConnect()), vscode.commands.registerCommand('wechat-vscode.disconnect', () => doDisconnect()), vscode.commands.registerCommand('wechat-vscode.showPanel', () => showOrCreatePanel()));
    logger_1.logger.info('WeChat VSCode extension activated');
    // Auto-reconnect if account exists
    const account = (0, accounts_1.loadLatestAccount)();
    if (account) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const cwd = workspaceFolders && workspaceFolders.length > 0
            ? workspaceFolders[0].uri.fsPath : undefined;
        if (cwd) {
            startDaemon(account, cwd);
        }
    }
}
function showOrCreatePanel() {
    if (panelInstance) {
        panelInstance.reveal();
        return;
    }
    panelInstance = panel_1.WeChatPanel.createOrShow(extContext.extensionUri);
    panelInstance.onDidDispose(() => {
        panelInstance = undefined;
    });
    extContext.subscriptions.push(panelInstance);
}
async function startConnect() {
    showOrCreatePanel();
    if (!panelInstance) {
        return;
    }
    statusBar.setStatus('connecting');
    panelInstance.updateStatus('正在生成二维码...');
    try {
        const { startQrLogin, waitForQrScan } = await Promise.resolve().then(() => __importStar(require('./wechat/login')));
        const { qrcodeUrl, qrcodeId } = await startQrLogin();
        const QRCode = await Promise.resolve().then(() => __importStar(require('qrcode')));
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger_1.logger.error('Connect failed', { error: msg });
        if (msg.includes('expired')) {
            panelInstance.updateStatus('⚠️ 二维码已过期，请重新连接');
            statusBar.setStatus('disconnected');
            vscode.window.showWarningMessage('二维码已过期，请重新点击连接。');
        }
        else if (msg.includes('cancelled')) {
            statusBar.setStatus('disconnected');
        }
        else {
            panelInstance.updateStatus('❌ 连接失败: ' + msg);
            statusBar.setStatus('error');
            vscode.window.showErrorMessage('微信连接失败: ' + msg);
        }
    }
}
function startDaemon(account, cwd) {
    if (monitorInstance) {
        monitorInstance.stop();
        monitorInstance = undefined;
    }
    const api = new api_1.WeChatApi(account.botToken, account.baseUrl);
    const sessionStore = (0, session_1.createSessionStore)();
    const session = sessionStore.load(account.accountId);
    if (cwd && session.workingDirectory !== cwd) {
        session.workingDirectory = cwd;
        sessionStore.save(account.accountId, session);
    }
    const sender = (0, send_1.createSender)(api, account.accountId);
    const sharedCtx = { lastContextToken: '' };
    const callbacks = {
        onMessage: async (msg) => {
            await handleMessage(msg, account, session, sessionStore, sender, cwd, sharedCtx);
        },
        onSessionExpired: () => {
            logger_1.logger.warn('Session expired');
            statusBar.setStatus('error');
            panelInstance?.updateStatus('⚠️ 微信会话已过期，请重新连接');
            vscode.window.showWarningMessage('微信会话已过期，请重新扫码绑定。');
        },
    };
    monitorInstance = (0, monitor_1.createMonitor)(api, callbacks);
    statusBar.setStatus('connected');
    logger_1.logger.info('Daemon started', { accountId: account.accountId, cwd });
    monitorInstance.run().catch((err) => {
        logger_1.logger.error('Monitor crashed', { error: err instanceof Error ? err.message : String(err) });
        statusBar.setStatus('error');
    });
}
async function handleMessage(msg, account, session, sessionStore, sender, cwd, sharedCtx) {
    if (msg.message_type !== types_1.MessageType.USER) {
        return;
    }
    if (!msg.from_user_id || !msg.item_list) {
        return;
    }
    const contextToken = msg.context_token ?? '';
    const fromUserId = msg.from_user_id;
    sharedCtx.lastContextToken = contextToken;
    const userText = extractTextFromItems(msg.item_list);
    const imageItem = (0, media_1.extractFirstImageUrl)(msg.item_list);
    // Concurrency guard
    if (session.state === 'processing') {
        if (userText.startsWith('/clear')) {
            await sender.sendText(fromUserId, contextToken, '⏳ 正在处理上一条消息，请稍后再清除会话');
        }
        else if (!userText.startsWith('/')) {
            await sender.sendText(fromUserId, contextToken, '⏳ 正在处理上一条消息，请稍后...');
        }
        if (!userText.startsWith('/status') && !userText.startsWith('/help')) {
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
            case 'clear':
                session.state = 'idle';
                sessionStore.clear(account.accountId, session);
                Object.assign(session, sessionStore.load(account.accountId));
                await sender.sendText(fromUserId, contextToken, '✅ 会话已清除。');
                return;
            case 'cwd':
                if (!args) {
                    await sender.sendText(fromUserId, contextToken, '当前工作目录: ' + session.workingDirectory + '\n用法: /cwd <路径>');
                }
                else {
                    session.workingDirectory = args;
                    sessionStore.save(account.accountId, session);
                    await sender.sendText(fromUserId, contextToken, '✅ 工作目录已切换为: ' + args);
                }
                return;
            case 'model':
                if (!args) {
                    await sender.sendText(fromUserId, contextToken, '用法: /model <模型名称>\n例: /model claude-sonnet-4-6');
                }
                else {
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
        const queryOptions = {
            prompt: userText || '请分析这张图片',
            cwd: session.workingDirectory || cwd,
            resume: session.sdkSessionId,
            model: session.model,
            permissionMode: session.permissionMode,
        };
        const result = await (0, provider_1.claudeQuery)(queryOptions);
        if (result.error) {
            logger_1.logger.error('Claude query error', { error: result.error });
            await sender.sendText(fromUserId, contextToken, '⚠️ Claude 处理请求时出错，请稍后重试。');
        }
        else if (result.text) {
            const chunks = splitMessage(result.text);
            for (const chunk of chunks) {
                await sender.sendText(fromUserId, contextToken, chunk);
            }
        }
        else {
            await sender.sendText(fromUserId, contextToken, 'ℹ️ Claude 无返回内容');
        }
        session.sdkSessionId = result.sessionId || undefined;
        session.state = 'idle';
        sessionStore.save(account.accountId, session);
        statusBar.setStatus('connected');
        panelInstance?.updateStatus('✅ 已连接，等待消息...');
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger_1.logger.error('Error in handleMessage', { error: errorMsg });
        await sender.sendText(fromUserId, contextToken, '⚠️ 处理消息时出错，请稍后重试。');
        session.state = 'idle';
        sessionStore.save(account.accountId, session);
        statusBar.setStatus('connected');
        panelInstance?.updateStatus('✅ 已连接，等待消息...');
    }
}
function doDisconnect() {
    if (monitorInstance) {
        monitorInstance.stop();
        monitorInstance = undefined;
    }
    statusBar.setStatus('disconnected');
    panelInstance?.updateStatus('已断开连接');
    panelInstance?.hideQrCode();
    panelInstance?.showConnectButton();
    vscode.window.showInformationMessage('微信已断开连接。');
    logger_1.logger.info('Disconnected by user');
}
function deactivate() {
    if (monitorInstance) {
        monitorInstance.stop();
        monitorInstance = undefined;
    }
    if (outputChannel) {
        outputChannel.dispose();
    }
    logger_1.logger.info('Extension deactivated');
}
//# sourceMappingURL=extension.js.map