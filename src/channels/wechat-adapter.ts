// ── WeChat Channel Adapter ────────────────────────────────────────────────
// Wraps the existing wechat/ modules into the unified Channel interface.

import { WeChatApi } from '../wechat/api';
import { createMonitor, type MonitorCallbacks } from '../wechat/monitor';
import { createSender } from '../wechat/send';
import { extractText } from '../wechat/media';
import { MessageType, type WeixinMessage } from '../wechat/types';
import type { AccountData } from '../wechat/accounts';
import { logger } from '../logger';
import type { Channel, ChannelCallbacks, ChannelMessage, ChannelSender } from './types';
import { CHANNEL_DISPLAY_NAMES } from './types';

function toChannelMessage(msg: WeixinMessage): ChannelMessage | null {
  if (msg.message_type !== MessageType.USER) return null;
  if (!msg.from_user_id || !msg.item_list) return null;

  const text = msg.item_list.map((item) => extractText(item)).filter(Boolean).join('\n');

  return {
    id: String(msg.message_id ?? Date.now()),
    fromUserId: msg.from_user_id,
    text,
    imageUrl: undefined, // WeChat images handled via downloadImage in claude/provider.ts
    contextToken: msg.context_token ?? '',
  };
}

export function createWeChatChannel(account: AccountData): Channel {
  const api = new WeChatApi(account.botToken, account.baseUrl);
  const sender = createSender(api, account.accountId);
  let monitor: ReturnType<typeof createMonitor> | undefined;

  return {
    channelType: 'wechat' as const,
    displayName: CHANNEL_DISPLAY_NAMES['wechat'],
    accountId: account.accountId,
    userId: account.userId,

    start(callbacks: ChannelCallbacks): void {
      const monitorCallbacks: MonitorCallbacks = {
        onMessage: async (msg: WeixinMessage) => {
          logger.info('WeChat raw message received', {
            messageId: msg.message_id,
            messageType: msg.message_type,
            fromUserId: msg.from_user_id,
            itemCount: msg.item_list?.length ?? 0,
            hasContextToken: !!msg.context_token,
          });
          const channelMsg = toChannelMessage(msg);
          if (channelMsg) {
            logger.info('Channel message forwarded', { id: channelMsg.id, textLength: channelMsg.text.length });
            await callbacks.onMessage(channelMsg);
          } else {
            logger.debug('Message filtered by toChannelMessage', { messageType: msg.message_type, fromUserId: msg.from_user_id });
          }
        },
        onSessionExpired: () => {
          logger.warn('WeChat session expired');
          callbacks.onSessionExpired();
        },
      };

      monitor = createMonitor(api, monitorCallbacks);
      monitor.run().catch((err) => {
        logger.error('WeChat monitor crashed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    },

    stop(): void {
      monitor?.stop();
      monitor = undefined;
    },

    getSender(): ChannelSender {
      return sender;
    },
  };
}
