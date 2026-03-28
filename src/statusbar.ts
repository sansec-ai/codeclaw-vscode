import * as vscode from 'vscode';
import { t } from './i18n';

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
      disconnected: { text: t('statusBarDisconnected', ch), tooltip: t('statusBarDisconnectedTooltip', ch), icon: '$(debug-disconnect)', color: '#888888' },
      connecting: { text: t('statusBarConnecting', ch), tooltip: t('statusBarConnectingTooltip', ch), icon: '$(sync~spin)', color: '#f0ad4e' },
      scanning: { text: t('statusBarScanning', ch), tooltip: t('statusBarScanningTooltip'), icon: '$(eye)', color: '#f0ad4e' },
      connected: { text: t('statusBarConnected', ch), tooltip: t('statusBarConnectedTooltip', ch), icon: '$(check)', color: '#5cb85c' },
      processing: { text: t('statusBarProcessing', ch), tooltip: t('statusBarProcessingTooltip', ch), icon: '$(loading~spin)', color: '#5bc0de' },
      error: { text: t('statusBarError', ch), tooltip: t('statusBarErrorTooltip', ch), icon: '$(error)', color: '#d9534f' },
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
