// ── WeChat Channel Adapter ────────────────────────────────────────────────
// Wraps the existing wechat/ modules into the unified Channel interface.

import { WeChatApi } from '../wechat/api';
import { createMonitor, type MonitorCallbacks } from '../wechat/monitor';
import { createSender } from '../wechat/send';
import { extractText, extractFirstImageUrl } from '../wechat/media';
import { MessageType, type WeixinMessage } from '../wechat/types';
import type { AccountData } from '../wechat/accounts';
import { logger } from '../logger';
import type { Channel, ChannelCallbacks, ChannelMessage, ChannelSender } from './types';
import { CHANNEL_DISPLAY_NAMES } from './types';

function toChannelMessage(msg: WeixinMessage): ChannelMessage | null {
  if (msg.message_type !== MessageType.USER) return null;
  if (!msg.from_user_id || !msg.item_list) return null;

  const text = msg.item_list.map((item) => extractText(item)).filter(Boolean).join('\n');
  const imageItem = extractFirstImageUrl(msg.item_list);
  const imageUrl = imageItem ? extractImageUrlFromItem(imageItem) : undefined;

  return {
    id: String(msg.message_id ?? Date.now()),
    fromUserId: msg.from_user_id,
    text,
    imageUrl,
    contextToken: msg.context_token ?? '',
  };
}

/** Extract a usable URL string from an image MessageItem (for passing to Claude) */
function extractImageUrlFromItem(item: any): string | undefined {
  // Currently we return a placeholder; the actual image download happens
  // inside claude/provider.ts when it detects an imageUrl.
  // For WeChat, images need CDN decryption, which is handled separately.
  // We store a special marker so the extension knows to use WeChat's downloadImage.
  return undefined; // Images are handled via the WeChat API, not raw URLs
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
          const channelMsg = toChannelMessage(msg);
          if (channelMsg) {
            await callbacks.onMessage(channelMsg);
          }
        },
        onSessionExpired: () => {
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
