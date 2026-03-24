"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAesKey = generateAesKey;
exports.aesEcbPaddedSize = aesEcbPaddedSize;
exports.encryptAesEcb = encryptAesEcb;
exports.decryptAesEcb = decryptAesEcb;
const crypto_1 = require("crypto");
function generateAesKey() {
    return (0, crypto_1.randomBytes)(16).toString("base64");
}
function aesEcbPaddedSize(size) {
    const block = 16;
    return Math.floor((size + block - 1) / block) * block;
}
function encryptAesEcb(key, plaintext) {
    const cipher = (0, crypto_1.createCipheriv)("aes-128-ecb", key, null);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}
function decryptAesEcb(key, ciphertext) {
    const decipher = (0, crypto_1.createDecipheriv)("aes-128-ecb", key, null);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
//# sourceMappingURL=crypto.js.map