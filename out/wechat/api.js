"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeChatApi = void 0;
const logger_1 = require("../logger");
function generateUin() {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    const view = new DataView(buf.buffer);
    const uint32 = view.getUint32(0, false);
    return Buffer.from(buf).toString('base64');
}
class WeChatApi {
    token;
    baseUrl;
    uin;
    constructor(token, baseUrl = 'https://ilinkai.weixin.qq.com') {
        if (baseUrl) {
            try {
                const url = new URL(baseUrl);
                const allowedHosts = ['weixin.qq.com', 'wechat.com'];
                const isAllowed = allowedHosts.some(h => url.hostname === h || url.hostname.endsWith('.' + h));
                if (url.protocol !== 'https:' || !isAllowed) {
                    logger_1.logger.warn('Untrusted baseUrl, using default', { baseUrl });
                    baseUrl = 'https://ilinkai.weixin.qq.com';
                }
            }
            catch {
                logger_1.logger.warn('Invalid baseUrl, using default', { baseUrl });
                baseUrl = 'https://ilinkai.weixin.qq.com';
            }
        }
        this.token = token;
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.uin = generateUin();
    }
    headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
            'AuthorizationType': 'ilink_bot_token',
            'X-WECHAT-UIN': this.uin,
        };
    }
    async request(path, body, timeoutMs = 15_000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const url = `${this.baseUrl}/${path}`;
        logger_1.logger.debug('API request', { url, body });
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
            const json = (await res.json());
            logger_1.logger.debug('API response', json);
            return json;
        }
        catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
            }
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async getUpdates(buf) {
        return this.request('ilink/bot/getupdates', buf ? { get_updates_buf: buf } : {}, 35_000);
    }
    async sendMessage(req) {
        await this.request('ilink/bot/sendmessage', req);
    }
    async getUploadUrl(fileType, fileSize, fileName) {
        return this.request('ilink/bot/getuploadurl', { file_type: fileType, file_size: fileSize, file_name: fileName });
    }
}
exports.WeChatApi = WeChatApi;
//# sourceMappingURL=api.js.map