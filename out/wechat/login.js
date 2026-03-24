"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startQrLogin = startQrLogin;
exports.waitForQrScan = waitForQrScan;
const accounts_1 = require("./accounts");
const logger_1 = require("../logger");
const QR_CODE_URL = `${accounts_1.DEFAULT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`;
const QR_STATUS_URL = `${accounts_1.DEFAULT_BASE_URL}/ilink/bot/get_qrcode_status`;
const POLL_INTERVAL_MS = 3_000;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function startQrLogin() {
    logger_1.logger.info('Requesting QR code');
    const res = await fetch(QR_CODE_URL);
    if (!res.ok) {
        throw new Error(`Failed to get QR code: HTTP ${res.status}`);
    }
    const data = (await res.json());
    if (data.ret !== 0 || !data.qrcode_img_content || !data.qrcode) {
        throw new Error(`Failed to get QR code (ret=${data.ret})`);
    }
    logger_1.logger.info('QR code obtained', { qrcodeId: data.qrcode });
    return {
        qrcodeUrl: data.qrcode_img_content,
        qrcodeId: data.qrcode,
    };
}
async function waitForQrScan(qrcodeId, signal) {
    let currentQrcodeId = qrcodeId;
    while (true) {
        if (signal?.aborted) {
            throw new Error('QR scan cancelled');
        }
        const url = `${QR_STATUS_URL}?qrcode=${encodeURIComponent(currentQrcodeId)}`;
        logger_1.logger.debug('Polling QR status', { qrcodeId: currentQrcodeId });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60_000);
        let res;
        try {
            res = await fetch(url, { signal: controller.signal });
        }
        catch (e) {
            clearTimeout(timer);
            if (e.name === 'AbortError' || e.code === 'ETIMEDOUT') {
                logger_1.logger.info('QR poll timed out, retrying');
                continue;
            }
            throw e;
        }
        clearTimeout(timer);
        if (!res.ok) {
            throw new Error(`Failed to check QR status: HTTP ${res.status}`);
        }
        const data = (await res.json());
        logger_1.logger.debug('QR status response', { status: data.status });
        switch (data.status) {
            case 'wait':
            case 'scaned':
                break;
            case 'confirmed': {
                if (!data.bot_token || !data.ilink_bot_id || !data.ilink_user_id) {
                    throw new Error('QR confirmed but missing required fields in response');
                }
                const accountData = {
                    botToken: data.bot_token,
                    accountId: data.ilink_bot_id,
                    baseUrl: data.baseurl || accounts_1.DEFAULT_BASE_URL,
                    userId: data.ilink_user_id,
                    createdAt: new Date().toISOString(),
                };
                (0, accounts_1.saveAccount)(accountData);
                logger_1.logger.info('QR login successful', { accountId: accountData.accountId });
                return accountData;
            }
            case 'expired': {
                logger_1.logger.info('QR code expired');
                throw new Error('QR code expired');
            }
            default:
                logger_1.logger.warn('Unknown QR status', { status: data.status, retmsg: data.retmsg });
                const status = data.status ?? '';
                if (status && (status.includes('not_support') ||
                    status.includes('version') ||
                    status.includes('forbid') ||
                    status.includes('reject') ||
                    status.includes('cancel'))) {
                    throw new Error(`二维码扫描失败: ${data.retmsg || status}`);
                }
                if (data.retmsg) {
                    throw new Error(`二维码扫描失败: ${data.retmsg}`);
                }
                break;
        }
        await sleep(POLL_INTERVAL_MS);
    }
}
//# sourceMappingURL=login.js.map