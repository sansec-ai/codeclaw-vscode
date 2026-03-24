"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSyncBuf = loadSyncBuf;
exports.saveSyncBuf = saveSyncBuf;
const store_1 = require("../store");
const constants_1 = require("../constants");
const node_path_1 = require("node:path");
const SYNC_BUF_PATH = (0, node_path_1.join)(constants_1.DATA_DIR, 'get_updates_buf');
function loadSyncBuf() {
    return (0, store_1.loadJson)(SYNC_BUF_PATH, '');
}
function saveSyncBuf(buf) {
    (0, store_1.saveJson)(SYNC_BUF_PATH, buf);
}
//# sourceMappingURL=sync-buf.js.map