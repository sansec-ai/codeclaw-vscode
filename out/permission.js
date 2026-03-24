"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPermissionBroker = createPermissionBroker;
const logger_1 = require("./logger");
const PERMISSION_TIMEOUT = 120_000;
const GRACE_PERIOD = 15_000;
function createPermissionBroker(onTimeout) {
    const pending = new Map();
    const timedOut = new Map();
    function createPending(accountId, toolName, toolInput) {
        const existing = pending.get(accountId);
        if (existing) {
            clearTimeout(existing.timer);
            pending.delete(accountId);
            existing.resolve(false);
            logger_1.logger.warn('Replaced existing pending permission', { accountId, toolName: existing.toolName });
        }
        timedOut.delete(accountId);
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                logger_1.logger.warn('Permission timeout, auto-denied', { accountId, toolName });
                pending.delete(accountId);
                timedOut.set(accountId, Date.now());
                setTimeout(() => timedOut.delete(accountId), GRACE_PERIOD);
                resolve(false);
                onTimeout?.();
            }, PERMISSION_TIMEOUT);
            pending.set(accountId, { toolName, toolInput, resolve, timer });
        });
    }
    function resolvePermission(accountId, allowed) {
        const perm = pending.get(accountId);
        if (!perm)
            return false;
        clearTimeout(perm.timer);
        pending.delete(accountId);
        perm.resolve(allowed);
        logger_1.logger.info('Permission resolved', { accountId, toolName: perm.toolName, allowed });
        return true;
    }
    function isTimedOut(accountId) {
        return timedOut.has(accountId);
    }
    function clearTimedOut(accountId) {
        timedOut.delete(accountId);
    }
    function getPending(accountId) {
        return pending.get(accountId);
    }
    function formatPendingMessage(perm) {
        return [
            '🔧 权限请求',
            '',
            `工具: ${perm.toolName}`,
            `输入: ${perm.toolInput.slice(0, 500)}`,
            '',
            '回复 y 允许，n 拒绝',
            '(120秒未回复自动拒绝)',
        ].join('\n');
    }
    function rejectPending(accountId) {
        const perm = pending.get(accountId);
        if (!perm)
            return false;
        clearTimeout(perm.timer);
        pending.delete(accountId);
        perm.resolve(false);
        logger_1.logger.info('Permission auto-rejected (session cleared)', { accountId, toolName: perm.toolName });
        return true;
    }
    return { createPending, resolvePermission, rejectPending, isTimedOut, clearTimedOut, getPending, formatPendingMessage };
}
//# sourceMappingURL=permission.js.map