import type {
  GetUpdatesResp,
  SendMessageReq,
  GetUploadUrlResp,
} from './types';
import { logger } from '../logger';

function generateUin(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const view = new DataView(buf.buffer);
  const uint32 = view.getUint32(0, false);
  return Buffer.from(buf).toString('base64');
}

export class WeChatApi {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly uin: string;

  constructor(token: string, baseUrl: string = 'https://ilinkai.weixin.qq.com') {
    if (baseUrl) {
      try {
        const url = new URL(baseUrl);
        const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        if (isLocal) {
          // Allow localhost for E2E testing without CODECLAW_ALLOW_LOCALHOST
          // Production will never use localhost URLs
        } else {
          const allowedHosts = ['weixin.qq.com', 'wechat.com'];
          const isAllowed = allowedHosts.some(h => url.hostname === h || url.hostname.endsWith('.' + h));
          if (url.protocol !== 'https:' || !isAllowed) {
            logger.warn('Untrusted baseUrl, using default', { baseUrl });
            baseUrl = 'https://ilinkai.weixin.qq.com';
          }
        }
      } catch {
        logger.warn('Invalid baseUrl, using default', { baseUrl });
        baseUrl = 'https://ilinkai.weixin.qq.com';
      }
    }
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.uin = generateUin();
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
      'AuthorizationType': 'ilink_bot_token',
      'X-WECHAT-UIN': this.uin,
    };
  }

  private async request<T>(
    path: string,
    body: unknown,
    timeoutMs: number = 15_000,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const url = `${this.baseUrl}/${path}`;

    logger.debug('API request', { url, body });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const json = (await res.json()) as T;
      logger.debug('API response', json);
      return json;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async getUpdates(buf?: string): Promise<GetUpdatesResp> {
    return this.request<GetUpdatesResp>(
      'ilink/bot/getupdates',
      buf ? { get_updates_buf: buf } : {},
      35_000,
    );
  }

  async sendMessage(req: SendMessageReq): Promise<void> {
    await this.request('ilink/bot/sendmessage', req);
  }

  async getUploadUrl(
    fileType: string,
    fileSize: number,
    fileName: string,
  ): Promise<GetUploadUrlResp> {
    return this.request<GetUploadUrlResp>(
      'ilink/bot/getuploadurl',
      { file_type: fileType, file_size: fileSize, file_name: fileName },
    );
  }
}
