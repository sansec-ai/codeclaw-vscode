"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCdnDownloadUrl = buildCdnDownloadUrl;
exports.downloadAndDecrypt = downloadAndDecrypt;
const crypto_1 = require("./crypto");
const logger_1 = require("../logger");
const accounts_1 = require("./accounts");
function buildCdnDownloadUrl(encryptQueryParam) {
    if (!/^[A-Za-z0-9%=&+._~-]+$/.test(encryptQueryParam)) {
        throw new Error('Invalid CDN query parameter');
    }
    return `${accounts_1.CDN_BASE_URL}?${encryptQueryParam}`;
}
async function downloadAndDecrypt(encryptQueryParam, aesKeyBase64) {
    const url = buildCdnDownloadUrl(encryptQueryParam);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let response;
    try {
        response = await fetch(url, { signal: controller.signal });
    }
    catch (err) {
        clearTimeout(timer);
        throw new Error(`CDN download failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    clearTimeout(timer);
    if (!response.ok) {
        throw new Error(`CDN download failed: ${response.status} ${response.statusText}`);
    }
    const encrypted = Buffer.from(await response.arrayBuffer());
    let aesKey;
    const raw = Buffer.from(aesKeyBase64, "base64");
    if (raw.length === 16) {
        aesKey = raw;
    }
    else {
        const hexStr = raw.toString("utf-8");
        aesKey = Buffer.from(hexStr, "hex");
    }
    const decrypted = (0, crypto_1.decryptAesEcb)(aesKey, encrypted);
    logger_1.logger.info("CDN download and decrypt succeeded", { size: decrypted.length });
    return decrypted;
}
//# sourceMappingURL=cdn.js.map