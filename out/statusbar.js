"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBarManager = void 0;
const vscode = __importStar(require("vscode"));
const STATUS_CONFIG = {
    disconnected: { text: 'WeChat: 未连接', tooltip: 'WeChat 未连接 - 点击连接', icon: '$(debug-disconnect)', color: '#888888' },
    connecting: { text: 'WeChat: 连接中...', tooltip: '正在连接微信...', icon: '$(sync~spin)', color: '#f0ad4e' },
    scanning: { text: 'WeChat: 等待扫码', tooltip: '请用微信扫描二维码', icon: '$(eye)', color: '#f0ad4e' },
    connected: { text: 'WeChat: 已连接', tooltip: '微信已连接', icon: '$(check)', color: '#5cb85c' },
    processing: { text: 'WeChat: 处理中...', tooltip: '正在处理微信消息', icon: '$(loading~spin)', color: '#5bc0de' },
    error: { text: 'WeChat: 错误', tooltip: '连接错误', icon: '$(error)', color: '#d9534f' },
};
class StatusBarManager {
    statusBarItem;
    currentStatus = 'disconnected';
    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'wechat-vscode.showPanel';
        this.applyStatus(this.currentStatus);
        this.statusBarItem.show();
    }
    setStatus(status) {
        this.currentStatus = status;
        this.applyStatus(status);
    }
    applyStatus(status) {
        const config = STATUS_CONFIG[status];
        this.statusBarItem.text = `${config.icon} ${config.text}`;
        this.statusBarItem.tooltip = config.tooltip;
        this.statusBarItem.color = config.color;
    }
    dispose() {
        this.statusBarItem.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusbar.js.map