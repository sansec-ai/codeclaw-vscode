"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadImage = downloadImage;
exports.extractText = extractText;
exports.extractFirstImageUrl = extractFirstImageUrl;
const types_1 = require("./types");
const cdn_1 = require("./cdn");
const logger_1 = require("../logger");
function detectMimeType(data) {
    if (data[0] === 0x89 && data[1] === 0x50)
        return 'image/png';
    if (data[0] === 0xFF && data[1] === 0xD8)
        return 'image/jpeg';
    if (data[0] === 0x47 && data[1] === 0x49)
        return 'image/gif';
    if (data[0] === 0x52 && data[1] === 0x49)
        return 'image/webp';
    if (data[0] === 0x42 && data[1] === 0x4D)
        return 'image/bmp';
    return 'image/jpeg';
}
function getImageCdnData(imageItem) {
    if (imageItem.cdn_media?.aes_key && imageItem.cdn_media?.encrypt_query_param) {
        return {
            aesKey: imageItem.cdn_media.aes_key,
            encryptQueryParam: imageItem.cdn_media.encrypt_query_param,
        };
    }
    if (imageItem.aeskey && imageItem.media?.encrypt_query_param) {
        return {
            aesKey: imageItem.aeskey,
            encryptQueryParam: imageItem.media.encrypt_query_param,
        };
    }
    logger_1.logger.warn('Image item has no usable CDN data', {
        hasCdnMedia: !!imageItem.cdn_media,
        hasAeskey: !!imageItem.aeskey,
        hasMedia: !!imageItem.media,
    });
    return null;
}
async function downloadImage(item) {
    const imageItem = item.image_item;
    if (!imageItem) {
        return null;
    }
    const cdnData = getImageCdnData(imageItem);
    if (!cdnData) {
        return null;
    }
    try {
        const decrypted = await (0, cdn_1.downloadAndDecrypt)(cdnData.encryptQueryParam, cdnData.aesKey);
        const mimeType = detectMimeType(decrypted);
        const base64 = decrypted.toString('base64');
        const dataUri = `data:${mimeType};base64,${base64}`;
        logger_1.logger.info('Image downloaded and decrypted', { size: decrypted.length });
        return dataUri;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger_1.logger.warn('Failed to download image', { error: msg });
        return null;
    }
}
function extractText(item) {
    return item.text_item?.text ?? '';
}
function extractFirstImageUrl(items) {
    return items?.find((item) => item.type === types_1.MessageItemType.IMAGE);
}
//# sourceMappingURL=media.js.map