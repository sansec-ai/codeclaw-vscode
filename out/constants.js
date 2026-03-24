"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATA_DIR = void 0;
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
exports.DATA_DIR = process.env.WCC_DATA_DIR || (0, node_path_1.join)((0, node_os_1.homedir)(), '.wechat-claude-code');
//# sourceMappingURL=constants.js.map