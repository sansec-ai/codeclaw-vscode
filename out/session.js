"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionStore = createSessionStore;
const store_1 = require("./store");
const node_fs_1 = require("node:fs");
const constants_1 = require("./constants");
const node_path_1 = require("node:path");
const SESSIONS_DIR = (0, node_path_1.join)(constants_1.DATA_DIR, 'sessions');
function validateAccountId(accountId) {
    if (!/^[a-zA-Z0-9_.@=-]+$/.test(accountId)) {
        throw new Error(`Invalid accountId: "${accountId}"`);
    }
}
const DEFAULT_MAX_HISTORY = 100;
function createSessionStore() {
    function getSessionPath(accountId) {
        validateAccountId(accountId);
        return (0, node_path_1.join)(SESSIONS_DIR, `${accountId}.json`);
    }
    function load(accountId) {
        validateAccountId(accountId);
        const session = (0, store_1.loadJson)(getSessionPath(accountId), {
            workingDirectory: process.cwd(),
            state: 'idle',
            chatHistory: [],
            maxHistoryLength: DEFAULT_MAX_HISTORY,
        });
        if (!session.chatHistory) {
            session.chatHistory = [];
        }
        if (!session.maxHistoryLength) {
            session.maxHistoryLength = DEFAULT_MAX_HISTORY;
        }
        return session;
    }
    function save(accountId, session) {
        (0, node_fs_1.mkdirSync)(SESSIONS_DIR, { recursive: true });
        const maxLen = session.maxHistoryLength || DEFAULT_MAX_HISTORY;
        if (session.chatHistory.length > maxLen) {
            session.chatHistory = session.chatHistory.slice(-maxLen);
        }
        (0, store_1.saveJson)(getSessionPath(accountId), session);
    }
    function clear(accountId, currentSession) {
        const session = {
            workingDirectory: currentSession?.workingDirectory ?? process.cwd(),
            model: currentSession?.model,
            permissionMode: currentSession?.permissionMode,
            state: 'idle',
            chatHistory: [],
            maxHistoryLength: currentSession?.maxHistoryLength || DEFAULT_MAX_HISTORY,
        };
        save(accountId, session);
        return session;
    }
    function addChatMessage(session, role, content) {
        if (!session.chatHistory) {
            session.chatHistory = [];
        }
        session.chatHistory.push({
            role,
            content,
            timestamp: Date.now(),
        });
        const maxLen = session.maxHistoryLength || DEFAULT_MAX_HISTORY;
        if (session.chatHistory.length > maxLen) {
            session.chatHistory = session.chatHistory.slice(-maxLen);
        }
    }
    function getChatHistoryText(session, limit) {
        const history = session.chatHistory || [];
        const messages = limit ? history.slice(-limit) : history;
        if (messages.length === 0) {
            return '暂无对话记录';
        }
        const lines = [];
        for (const msg of messages) {
            const time = new Date(msg.timestamp).toLocaleString('zh-CN');
            const role = msg.role === 'user' ? '用户' : 'Claude';
            lines.push(`[${time}] ${role}:`);
            lines.push(msg.content);
            lines.push('');
        }
        return lines.join('\n');
    }
    return { load, save, clear, addChatMessage, getChatHistoryText };
}
//# sourceMappingURL=session.js.map