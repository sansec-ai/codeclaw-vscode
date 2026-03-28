import * as vscode from 'vscode';

type ConnectionStatus = 'disconnected' | 'connecting' | 'scanning' | 'connected' | 'processing' | 'error';

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private currentStatus: ConnectionStatus = 'disconnected';
  private channelName: string = '';

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.command = 'codeClaw.showPanel';
    this.applyStatus(this.currentStatus);
    this.statusBarItem.show();
  }

  public setChannelName(name: string): void {
    this.channelName = name;
    this.applyStatus(this.currentStatus);
  }

  public setStatus(status: ConnectionStatus): void {
    this.currentStatus = status;
    this.applyStatus(status);
  }

  private applyStatus(status: ConnectionStatus): void {
    const ch = this.channelName || 'WeChat';
    const configs: Record<ConnectionStatus, { text: string; tooltip: string; icon: string; color: string }> = {
      disconnected: { text: `${ch}: 未连接`, tooltip: `${ch} 未连接 - 点击连接`, icon: '$(debug-disconnect)', color: '#888888' },
      connecting: { text: `${ch}: 连接中...`, tooltip: `正在连接${ch}...`, icon: '$(sync~spin)', color: '#f0ad4e' },
      scanning: { text: `${ch}: 等待扫码`, tooltip: `请用微信扫描二维码`, icon: '$(eye)', color: '#f0ad4e' },
      connected: { text: `${ch}: 已连接`, tooltip: `${ch}已连接`, icon: '$(check)', color: '#5cb85c' },
      processing: { text: `${ch}: 处理中...`, tooltip: `正在处理${ch}消息`, icon: '$(loading~spin)', color: '#5bc0de' },
      error: { text: `${ch}: 错误`, tooltip: `${ch}连接错误`, icon: '$(error)', color: '#d9534f' },
    };
    const config = configs[status];
    this.statusBarItem.text = `${config.icon} ${config.text}`;
    this.statusBarItem.tooltip = config.tooltip;
    this.statusBarItem.color = config.color;
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
