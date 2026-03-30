// ── Telegram Bot API Client ──────────────────────────────────────────────

import { logger } from '../logger';

// ── Types ────────────────────────────────────────────────────────────────

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  width: number;
  height: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: { file_id: string; file_name?: string };
  voice?: { file_id: string };
  video?: { file_id: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: any;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

// ── API Client ───────────────────────────────────────────────────────────

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const DEFAULT_POLL_TIMEOUT = 30;
const REQUEST_TIMEOUT_MS = 35_000;

export class TelegramApi {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(token: string, baseUrl: string = TELEGRAM_API_BASE) {
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private apiUrl(method: string): string {
    return `${this.baseUrl}/bot${this.token}/${method}`;
  }

  private fileUrl(filePath: string): string {
    return `${this.baseUrl}/file/bot${this.token}/${filePath}`;
  }

  private async request<T>(
    method: string,
    body?: Record<string, unknown>,
    timeoutMs: number = 15_000,
  ): Promise<T> {
    const url = this.apiUrl(method);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    logger.debug('Telegram API request', { method, url });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const json = (await res.json()) as TelegramApiResponse<T>;

      if (!json.ok) {
        throw new TelegramApiError(
          json.error_code ?? res.status,
          json.description ?? `HTTP ${res.status}`,
        );
      }

      return json.result as T;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Telegram API request to ${method} timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Verify token and get bot info */
  async getMe(): Promise<TelegramUser> {
    return this.request<TelegramUser>('getMe');
  }

  /** Long-poll for updates */
  async getUpdates(offset?: number, timeout: number = DEFAULT_POLL_TIMEOUT): Promise<TelegramUpdate[]> {
    const body: Record<string, unknown> = { timeout };
    if (offset !== undefined) {
      body.offset = offset;
    }
    // Use a longer timeout for long-polling requests
    return this.request<TelegramUpdate[]>('getUpdates', body, timeout * 1000 + 5000);
  }

  /** Send a text message */
  async sendMessage(chatId: number | string, text: string): Promise<TelegramMessage> {
    return this.request<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
  }

  /** Get file info for downloading */
  async getFile(fileId: string): Promise<TelegramFile> {
    return this.request<TelegramFile>('getFile', { file_id: fileId });
  }

  /** Download a file by its file_path (from getFile response) */
  async downloadFile(filePath: string): Promise<Buffer> {
    const url = this.fileUrl(filePath);
    logger.debug('Downloading Telegram file', { url });

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download file: HTTP ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

export class TelegramApiError extends Error {
  constructor(
    public readonly errorCode: number,
    message: string,
  ) {
    super(`Telegram API error ${errorCode}: ${message}`);
    this.name = 'TelegramApiError';
  }
}
