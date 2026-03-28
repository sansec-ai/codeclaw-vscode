// ── Telegram Channel Adapter ─────────────────────────────────────────────
// Implements the unified Channel interface for Telegram Bot API.

import { TelegramApi, TelegramApiError, type TelegramUpdate, type TelegramPhotoSize } from './telegram-api';
import { logger } from '../logger';
import type { Channel, ChannelCallbacks, ChannelMessage, ChannelSender } from './types';
import { CHANNEL_DISPLAY_NAMES } from './types';

// ── Message Conversion ───────────────────────────────────────────────────

function toChannelMessage(update: TelegramUpdate, api: TelegramApi): ChannelMessage | null {
  const msg = update.message;
  if (!msg) return null;

  // Ignore messages from bots
  if (msg.from?.is_bot) return null;

  // Only accept private chats (for security)
  if (msg.chat.type !== 'private') return null;

  const text = msg.text ?? msg.caption ?? '';
  const fromUserId = String(msg.chat.id);

  return {
    id: String(update.update_id),
    fromUserId,
    text,
    imageUrl: undefined, // filled lazily in start() if photo present
    contextToken: String(msg.message_id),
    _rawPhoto: msg.photo ? msg.photo[msg.photo.length - 1] : undefined,
    _api: msg.photo ? api : undefined,
  } as ChannelMessage & { _rawPhoto?: TelegramPhotoSize; _api?: TelegramApi };
}

// ── Sender ───────────────────────────────────────────────────────────────

function createTelegramSender(api: TelegramApi): ChannelSender {
  return {
    async sendText(toUserId: string, contextToken: string, text: string): Promise<void> {
      const chatId = Number(toUserId);
      logger.info('Sending Telegram message', { chatId, textLength: text.length });
      try {
        await api.sendMessage(chatId, text);
        logger.debug('Telegram message sent', { chatId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('Failed to send Telegram message', { error: msg, chatId });
        throw err;
      }
    },
  };
}

// ── Channel Factory ──────────────────────────────────────────────────────

export interface TelegramChannelOptions {
  /** Custom API base URL (default: https://api.telegram.org, use for testing) */
  baseUrl?: string;
  /** Long-poll timeout in seconds (default: 30, use 1-2 for tests) */
  pollTimeout?: number;
  /** Only accept messages from these chat IDs (default: accept all private chats) */
  allowedChatIds?: number[];
}

export function createTelegramChannel(
  botToken: string,
  options?: TelegramChannelOptions,
): Channel {
  const api = new TelegramApi(botToken, options?.baseUrl);
  const sender = createTelegramSender(api);
  const pollTimeout = options?.pollTimeout ?? 30;
  const allowedChatIds = options?.allowedChatIds;

  let controller: AbortController | undefined;
  let running = false;

  return {
    channelType: 'telegram' as const,
    displayName: CHANNEL_DISPLAY_NAMES['telegram'],
    accountId: '', // set by caller (e.g. bot.id from doTelegramSetup)
    userId: '', // Telegram: userId is per-message (chat_id)

    start(callbacks: ChannelCallbacks): void {
      if (running) return;
      running = true;
      controller = new AbortController();

      pollLoop(api, callbacks, controller.signal, pollTimeout, allowedChatIds)
        .catch((err) => {
          if (controller?.signal.aborted) return;
          logger.error('Telegram poll loop crashed', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    },

    stop(): void {
      controller?.abort();
      controller = undefined;
      running = false;
    },

    getSender(): ChannelSender {
      return sender;
    },
  };
}

// ── Poll Loop ────────────────────────────────────────────────────────────

const BACKOFF_SHORT_MS = 3_000;
const BACKOFF_LONG_MS = 30_000;
const BACKOFF_THRESHOLD = 3;

async function pollLoop(
  api: TelegramApi,
  callbacks: ChannelCallbacks,
  signal: AbortSignal,
  pollTimeout: number,
  allowedChatIds?: number[],
): Promise<void> {
  let offset = 0;
  let consecutiveFailures = 0;

  while (!signal.aborted) {
    try {
      const updates = await api.getUpdates(offset || undefined, pollTimeout);

      if (updates.length > 0) {
        logger.info('Telegram updates received', { count: updates.length });

        for (const update of updates) {
          // Advance offset past this update
          if (update.update_id >= offset) {
            offset = update.update_id + 1;
          }

          const channelMsg = toChannelMessage(update, api);
          if (!channelMsg) continue;

          // Download photo if present
          const raw = (channelMsg as any)._rawPhoto;
          const photoApi = (channelMsg as any)._api;
          if (raw && photoApi) {
            try {
              const fileInfo = await photoApi.getFile(raw.file_id);
              if (fileInfo.file_path) {
                const buf = await photoApi.downloadFile(fileInfo.file_path);
                channelMsg.imageUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
                logger.info('Downloaded Telegram photo', { fileId: raw.file_id, size: buf.length });
              }
            } catch (imgErr) {
              logger.warn('Failed to download Telegram photo', {
                error: imgErr instanceof Error ? imgErr.message : String(imgErr),
                fileId: raw.file_id,
              });
            }
            delete (channelMsg as any)._rawPhoto;
            delete (channelMsg as any)._api;
          }

          // Filter by allowed chat IDs if configured
          if (allowedChatIds && allowedChatIds.length > 0) {
            const chatId = Number(channelMsg.fromUserId);
            if (!allowedChatIds.includes(chatId)) {
              logger.debug('Ignoring message from non-allowed chat', { chatId });
              continue;
            }
          }

          try {
            await callbacks.onMessage(channelMsg);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('Error processing Telegram message', {
              error: msg,
              updateId: update.update_id,
            });
          }
        }
      }

      consecutiveFailures = 0;
    } catch (err) {
      if (signal.aborted) break;

      // Detect auth errors (401) → session expired
      if (err instanceof TelegramApiError && err.errorCode === 401) {
        logger.error('Telegram token invalid or revoked');
        callbacks.onSessionExpired();
        break;
      }

      consecutiveFailures++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Telegram poll error', { error: errorMsg, consecutiveFailures });

      const backoff = consecutiveFailures >= BACKOFF_THRESHOLD ? BACKOFF_LONG_MS : BACKOFF_SHORT_MS;
      await sleep(backoff, signal);
    }
  }

  logger.info('Telegram poll loop stopped');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) { resolve(); return; }
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
