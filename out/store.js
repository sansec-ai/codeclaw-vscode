"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadJson = loadJson;
exports.saveJson = saveJson;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/**
 * Load a JSON file, returning a typed object or the fallback if the file
 * does not exist or cannot be parsed.
 */
function loadJson(filePath, fallback) {
    try {
        const raw = (0, node_fs_1.readFileSync)(filePath, "utf-8");
        return JSON.parse(raw);
    }
    catch (err) {
        // Ignore ENOENT silently
        return fallback;
    }
}
/**
 * Persist an object as pretty-printed JSON.
 * File is written with mode 0o600 (owner read/write only).
 */
function saveJson(filePath, data) {
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(filePath), { recursive: true });
    const raw = JSON.stringify(data, null, 2) + "\n";
    (0, node_fs_1.writeFileSync)(filePath, raw, "utf-8");
    if (process.platform !== 'win32') {
        (0, node_fs_1.chmodSync)(filePath, 0o600);
    }
}
//# sourceMappingURL=store.js.map