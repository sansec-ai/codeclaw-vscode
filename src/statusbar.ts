import * as vscode from 'vscode';

type ConnectionStatus = 'disconnected' | 'connecting' | 'scanning' | 'connected' | 'processing' | 'error';

const STATUS_CONFIG: Record<ConnectionStatus, { text: string; tooltip: string; icon: string; color: string }> = {
  disconnected: { text: 'WeChat: 未连接', tooltip: 'WeChat 未连接 - 点击连接', icon: '$(debug-disconnect)', color: '#888888' },
  connecting: { text: 'WeChat: 连接中...', tooltip: '正在连接微信...', icon: '$(sync~spin)', color: '#f0ad4e' },
  scanning: { text: 'WeChat: 等待扫码', tooltip: '请用微信扫描二维码', icon: '$(eye)', color: '#f0ad4e' },
  connected: { text: 'WeChat: 已连接', tooltip: '微信已连接', icon: '$(check)', color: '#5cb85c' },
  processing: { text: 'WeChat: 处理中...', tooltip: '正在处理微信消息', icon: '$(loading~spin)', color: '#5bc0de' },
  error: { text: 'WeChat: 错误', tooltip: '连接错误', icon: '$(error)', color: '#d9534f' },
};

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private currentStatus: ConnectionStatus = 'disconnected';

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.command = 'wechat-vscode.showPanel';
    this.applyStatus(this.currentStatus);
    this.statusBarItem.show();
  }

  public setStatus(status: ConnectionStatus): void {
    this.currentStatus = status;
    this.applyStatus(status);
  }

  private applyStatus(status: ConnectionStatus): void {
    const config = STATUS_CONFIG[status];
    this.statusBarItem.text = `${config.icon} ${config.text}`;
    this.statusBarItem.tooltip = config.tooltip;
    this.statusBarItem.color = config.color;
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
