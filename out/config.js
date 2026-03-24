"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
const CONFIG_DIR = (0, node_path_1.join)((0, node_os_1.homedir)(), ".wechat-claude-code");
const CONFIG_PATH = (0, node_path_1.join)(CONFIG_DIR, "config.env");
function ensureConfigDir() {
    (0, node_fs_1.mkdirSync)(CONFIG_DIR, { recursive: true });
}
function parseConfigFile(content) {
    const config = { workingDirectory: process.cwd() };
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1)
            continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        switch (key) {
            case "workingDirectory":
                config.workingDirectory = value;
                break;
            case "model":
                config.model = value;
                break;
            case "permissionMode":
                if (value === "default" ||
                    value === "acceptEdits" ||
                    value === "plan" ||
                    value === "auto") {
                    config.permissionMode = value;
                }
                break;
        }
    }
    return config;
}
function loadConfig() {
    try {
        const content = (0, node_fs_1.readFileSync)(CONFIG_PATH, "utf-8");
        return parseConfigFile(content);
    }
    catch {
        return { workingDirectory: process.cwd() };
    }
}
function saveConfig(config) {
    ensureConfigDir();
    const lines = [];
    lines.push(`workingDirectory=${config.workingDirectory}`);
    if (config.model) {
        lines.push(`model=${config.model}`);
    }
    if (config.permissionMode) {
        lines.push(`permissionMode=${config.permissionMode}`);
    }
    (0, node_fs_1.writeFileSync)(CONFIG_PATH, lines.join("\n") + "\n", "utf-8");
    if (process.platform !== 'win32') {
        (0, node_fs_1.chmodSync)(CONFIG_PATH, 0o600);
    }
}
//# sourceMappingURL=config.js.map