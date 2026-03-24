"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMonitor = createMonitor;
const sync_buf_1 = require("./sync-buf");
const logger_1 = require("../logger");
const SESSION_EXPIRED_ERRCODE = -14;
const SESSION_EXPIRED_PAUSE_MS = 60 * 60 * 1000;
const BACKOFF_THRESHOLD = 3;
const BACKOFF_LONG_MS = 30_000;
const BACKOFF_SHORT_MS = 3_000;
function createMonitor(api, callbacks) {
    const controller = new AbortController();
    let stopped = false;
    const recentMsgIds = new Set();
    const MAX_MSG_IDS = 1000;
    async function run() {
        let consecutiveFailures = 0;
        while (!controller.signal.aborted) {
            try {
                const buf = (0, sync_buf_1.loadSyncBuf)();
                logger_1.logger.debug('Polling for messages', { hasBuf: buf.length > 0 });
                const resp = await api.getUpdates(buf || undefined);
                if (resp.ret === SESSION_EXPIRED_ERRCODE) {
                    logger_1.logger.warn('Session expired, pausing for 1 hour');
                    callbacks.onSessionExpired();
                    await sleep(SESSION_EXPIRED_PAUSE_MS, controller.signal);
                    consecutiveFailures = 0;
                    continue;
                }
                if (resp.ret !== undefined && resp.ret !== 0) {
                    logger_1.logger.warn('getUpdates returned error', { ret: resp.ret, retmsg: resp.retmsg });
                }
                if (resp.get_updates_buf) {
                    (0, sync_buf_1.saveSyncBuf)(resp.get_updates_buf);
                }
                const messages = resp.msgs ?? [];
                if (messages.length > 0) {
                    logger_1.logger.info('Received messages', { count: messages.length });
                    for (const msg of messages) {
                        if (msg.message_id && recentMsgIds.has(msg.message_id)) {
                            continue;
                        }
                        if (msg.message_id) {
                            recentMsgIds.add(msg.message_id);
                            if (recentMsgIds.size > MAX_MSG_IDS) {
                                const iter = recentMsgIds.values();
                                const toDelete = [];
                                for (let i = 0; i < MAX_MSG_IDS / 2; i++) {
                                    const { value } = iter.next();
                                    if (value !== undefined)
                                        toDelete.push(value);
                                }
                                for (const id of toDelete)
                                    recentMsgIds.delete(id);
                            }
                        }
                        try {
                            await callbacks.onMessage(msg);
                        }
                        catch (err) {
                            const msg2 = err instanceof Error ? err.message : String(err);
                            logger_1.logger.error('Error processing message', { error: msg2, messageId: msg.message_id });
                        }
                    }
                }
                consecutiveFailures = 0;
            }
            catch (err) {
                if (controller.signal.aborted) {
                    break;
                }
                consecutiveFailures++;
                const errorMsg = err instanceof Error ? err.message : String(err);
                logger_1.logger.error('Monitor error', { error: errorMsg, consecutiveFailures });
                const backoff = consecutiveFailures >= BACKOFF_THRESHOLD ? BACKOFF_LONG_MS : BACKOFF_SHORT_MS;
                logger_1.logger.info(`Backing off ${backoff}ms`, { consecutiveFailures });
                await sleep(backoff, controller.signal);
            }
        }
        stopped = true;
        logger_1.logger.info('Monitor stopped');
    }
    function stop() {
        if (!controller.signal.aborted) {
            logger_1.logger.info('Stopping monitor...');
            controller.abort();
        }
    }
    return { run, stop };
}
function sleep(ms, signal) {
    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}
//# sourceMappingURL=monitor.js.map