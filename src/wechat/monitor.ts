import { WeChatApi } from './api';
import { loadSyncBuf, saveSyncBuf } from './sync-buf';
import { logger } from '../logger';
import type { WeixinMessage } from './types';

const SESSION_EXPIRED_ERRCODE = -14;
const SESSION_EXPIRED_PAUSE_MS = 60 * 60 * 1000;
const BACKOFF_THRESHOLD = 3;
const BACKOFF_LONG_MS = 30_000;
const BACKOFF_SHORT_MS = 3_000;

export interface MonitorCallbacks {
  onMessage: (msg: WeixinMessage) => Promise<void>;
  onSessionExpired: () => void;
}

export function createMonitor(api: WeChatApi, callbacks: MonitorCallbacks) {
  const controller = new AbortController();
  let stopped = false;
  const recentMsgIds = new Set<number>();
  const recentMsgHashes = new Set<string>(); // content-based dedup fallback
  const MAX_MSG_IDS = 1000;
  const MAX_MSG_HASHES = 500;

  function msgHash(msg: WeixinMessage): string {
    // Hash user_id + text + timestamp (5s window) for content-based dedup
    const text = msg.item_list?.map(i => i.text_item?.text ?? '').join('') ?? '';
    const ts5s = Math.floor((msg.create_time_ms ?? 0) / 5000);
    return `${msg.from_user_id}:${ts5s}:${text}`;
  }

  async function run(): Promise<void> {
    let consecutiveFailures = 0;

    while (!controller.signal.aborted) {
      try {
        const buf = loadSyncBuf();
        logger.debug('Polling for messages', { hasBuf: buf.length > 0 });

        const resp = await api.getUpdates(buf || undefined);

        if (resp.ret === SESSION_EXPIRED_ERRCODE) {
          logger.warn('Session expired, pausing for 1 hour');
          callbacks.onSessionExpired();
          await sleep(SESSION_EXPIRED_PAUSE_MS, controller.signal);
          consecutiveFailures = 0;
          continue;
        }

        if (resp.ret !== undefined && resp.ret !== 0) {
          consecutiveFailures++;
          logger.warn('getUpdates returned error', { ret: resp.ret, retmsg: resp.retmsg, consecutiveFailures });
          // Clear stale sync-buf to force a fresh poll next time
          saveSyncBuf('');
          const backoff = consecutiveFailures >= BACKOFF_THRESHOLD ? BACKOFF_LONG_MS : BACKOFF_SHORT_MS;
          await sleep(backoff, controller.signal);
          continue;
        }

        if (resp.get_updates_buf) {
          saveSyncBuf(resp.get_updates_buf);
        }

        const messages = resp.msgs ?? [];
        if (messages.length > 0) {
          logger.info('Received messages', { count: messages.length });
          for (const msg of messages) {
            // Dedup by message_id (if present and non-zero)
            const hasId = msg.message_id !== undefined && msg.message_id !== null && msg.message_id !== 0;
            if (hasId && recentMsgIds.has(msg.message_id!)) {
              logger.debug('Skipping duplicate message by id', { messageId: msg.message_id });
              continue;
            }
            // Dedup by content hash (fallback for missing/zero message_id)
            const hash = msgHash(msg);
            if (recentMsgHashes.has(hash)) {
              logger.debug('Skipping duplicate message by hash', { hash });
              continue;
            }
            if (hasId) {
              recentMsgIds.add(msg.message_id!);
              if (recentMsgIds.size > MAX_MSG_IDS) {
                const iter = recentMsgIds.values();
                const toDelete: number[] = [];
                for (let i = 0; i < MAX_MSG_IDS / 2; i++) {
                  const { value } = iter.next();
                  if (value !== undefined) toDelete.push(value);
                }
                for (const id of toDelete) recentMsgIds.delete(id);
              }
            }
            recentMsgHashes.add(hash);
            if (recentMsgHashes.size > MAX_MSG_HASHES) {
              const iter = recentMsgHashes.values();
              const toDelete: string[] = [];
              for (let i = 0; i < MAX_MSG_HASHES / 2; i++) {
                const { value } = iter.next();
                if (value !== undefined) toDelete.push(value);
              }
              for (const h of toDelete) recentMsgHashes.delete(h);
            }
            try {
              await callbacks.onMessage(msg);
            } catch (err) {
              const msg2 = err instanceof Error ? err.message : String(err);
              logger.error('Error processing message', { error: msg2, messageId: msg.message_id });
            }
          }
        }

        consecutiveFailures = 0;
      } catch (err) {
        if (controller.signal.aborted) {
          break;
        }

        consecutiveFailures++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error('Monitor error', { error: errorMsg, consecutiveFailures });

        const backoff = consecutiveFailures >= BACKOFF_THRESHOLD ? BACKOFF_LONG_MS : BACKOFF_SHORT_MS;
        logger.info(`Backing off ${backoff}ms`, { consecutiveFailures });
        await sleep(backoff, controller.signal);
      }
    }

    stopped = true;
    logger.info('Monitor stopped');
  }

  function stop(): void {
    if (!controller.signal.aborted) {
      logger.info('Stopping monitor...');
      controller.abort();
    }
  }

  return { run, stop };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; signal?.removeEventListener('abort', onAbort); resolve(); }
    }, ms);
    const onAbort = () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(); }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
