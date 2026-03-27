// ── Unified channel types ──────────────────────────────────────────────────
// Channel-agnostic message and interface definitions.
// Each channel (WeChat, Telegram, etc.) implements Channel.

/** Unified message received from any channel */
export interface ChannelMessage {
  /** Unique message identifier (channel-specific) */
  id: string;
  /** User who sent the message */
  fromUserId: string;
  /** Extracted text content (joined if multiple text items) */
  text: string;
  /** Image URL / data-URI if the message contains an image */
  imageUrl?: string;
  /** Channel-specific context token (for threading / replying) */
  contextToken: string;
}

/** Callbacks a channel fires into the extension */
export interface ChannelCallbacks {
  onMessage: (msg: ChannelMessage) => Promise<void>;
  onSessionExpired: () => void;
}

/** Minimal sender contract shared by all channels */
export interface ChannelSender {
  sendText(toUserId: string, contextToken: string, text: string): Promise<void>;
}

/** Channel display names (user-facing, e.g. "微信", "Telegram") */
export const CHANNEL_DISPLAY_NAMES: Record<string, string> = {
  wechat: '微信',
  telegram: 'Telegram',
};

/** Channel lifecycle interface */
export interface Channel {
  /** Discriminator: 'wechat', 'telegram', etc. */
  readonly channelType: string;
  /** User-facing channel name (e.g. "微信") */
  readonly displayName: string;
  /** Channel-specific account identifier */
  readonly accountId: string;
  /** End-user identifier (the human chatting) */
  readonly userId: string;
  /** Start listening for messages (non-blocking) */
  start(callbacks: ChannelCallbacks): void;
  /** Stop listening and release resources */
  stop(): void;
  /** Obtain the sender for this channel */
  getSender(): ChannelSender;
}

/** Channel type discriminator */
export type ChannelType = 'wechat' | 'telegram';
