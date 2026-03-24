"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CDN_BASE_URL = exports.DEFAULT_BASE_URL = void 0;
exports.saveAccount = saveAccount;
exports.loadAccount = loadAccount;
exports.loadLatestAccount = loadLatestAccount;
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
const node_fs_1 = require("node:fs");
const store_1 = require("../store");
const logger_1 = require("../logger");
exports.DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
exports.CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';
const ACCOUNTS_DIR = (0, node_path_1.join)((0, node_os_1.homedir)(), '.wechat-claude-code', 'accounts');
function validateAccountId(accountId) {
    if (!/^[a-zA-Z0-9_.@=-]+$/.test(accountId)) {
        throw new Error(`Invalid accountId: "${accountId}"`);
    }
}
function accountPath(accountId) {
    validateAccountId(accountId);
    return (0, node_path_1.join)(ACCOUNTS_DIR, `${accountId}.json`);
}
function saveAccount(data) {
    const filePath = accountPath(data.accountId);
    (0, store_1.saveJson)(filePath, data);
    logger_1.logger.info('Account saved', { accountId: data.accountId });
}
function loadAccount(accountId) {
    const filePath = accountPath(accountId);
    const data = (0, store_1.loadJson)(filePath, null);
    if (data) {
        logger_1.logger.info('Account loaded', { accountId });
    }
    return data;
}
function loadLatestAccount() {
    try {
        const files = (0, node_fs_1.readdirSync)(ACCOUNTS_DIR).filter((f) => f.endsWith('.json'));
        if (files.length === 0)
            return null;
        let latestFile = files[0];
        let latestMtime = 0;
        for (const file of files) {
            const stat = (0, node_fs_1.statSync)((0, node_path_1.join)(ACCOUNTS_DIR, file));
            if (stat.mtimeMs > latestMtime) {
                latestMtime = stat.mtimeMs;
                latestFile = file;
            }
        }
        const accountId = latestFile.replace(/\.json$/, '');
        return loadAccount(accountId);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=accounts.js.map