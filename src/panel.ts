import * as vscode from 'vscode';

// =========================================================================
// Types
// =========================================================================

export type ViewState = {
  status: string;
  dotClass: string;
  showQr: boolean;
  showConnect: boolean;
  showDisconnect: boolean;
  /** QR code data URI to display */
  qrDataUri?: string;
  /** Show the rebind (switch channel) button */
  showRebind?: boolean;
  /** Label for the connect button; defaults to '🔗 连接微信' */
  connectLabel?: string;
  /** Current channel display name (e.g. '微信', 'Telegram') */
  channelName?: string;
};

export const DISCONNECTED_STATE: ViewState = {
  status: '未连接',
  dotClass: 'disconnected',
  showQr: false,
  showConnect: true,
  showDisconnect: false,
};

export function connectedState(cwd: string, channelName: string = '微信'): ViewState {
  return {
    status: channelName + '已连接 — ' + cwd,
    dotClass: 'connected',
    showQr: false,
    showConnect: false,
    showDisconnect: true,
    channelName,
  };
}

export function processingState(channelName: string = '微信'): ViewState {
  return {
    status: '⏳ 正在处理消息...',
    dotClass: 'connecting',
    showQr: false,
    showConnect: false,
    showDisconnect: true,
    channelName,
  };
}

// =========================================================================
// WeChatPanel — Editor tab WebView
// =========================================================================

export class WeChatPanel {
  public static currentPanel: WeChatPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private readonly _extensionUri: vscode.Uri;
  private _state: ViewState = DISCONNECTED_STATE;
  private _stateVersion = 0;

  private static readonly VIEW_TYPE = 'wechatClaudeCode';

  public static createOrShow(extensionUri: vscode.Uri, initialState?: ViewState): WeChatPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (WeChatPanel.currentPanel) {
      WeChatPanel.currentPanel._panel.reveal(column);
      return WeChatPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      WeChatPanel.VIEW_TYPE,
      'Code Claw',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    WeChatPanel.currentPanel = new WeChatPanel(panel, extensionUri, initialState);
    return WeChatPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, initialState?: ViewState) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    if (initialState) { this._state = initialState; }

    this._panel.webview.html = getWebviewHtml('full', this._state, this._stateVersion);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'connect':
            vscode.commands.executeCommand('codeClaw.connect');
            break;
          case 'disconnect':
            vscode.commands.executeCommand('codeClaw.disconnect');
            break;
        }
      },
      null,
      this._disposables,
    );
  }

  public reveal(): void { this._panel.reveal(); }

  public showQrCode(dataUri: string): void {
    this._state = { ...this._state, showQr: true, showConnect: false };
    this._panel.webview.postMessage({ command: 'showQrCode', dataUri, version: this._stateVersion });
  }

  public hideQrCode(): void {
    this._state = { ...this._state, showQr: false };
    this._panel.webview.postMessage({ command: 'hideQrCode', version: this._stateVersion });
  }

  public showConnectButton(): void {
    this._state = { ...this._state, showConnect: true, showDisconnect: false };
    this._panel.webview.postMessage({ command: 'showConnectButton', version: this._stateVersion });
  }

  public setState(state: ViewState): void {
    this._state = state;
    this._stateVersion++;
    this._panel.webview.html = getWebviewHtml('full', state, this._stateVersion);
  }

  public updateStatus(status: string): void {
    this._state.status = status;
    this._panel.webview.postMessage({ command: 'updateStatus', status, version: this._stateVersion });
  }

  public onDidDispose(callback: () => void): void {
    this._panel.onDidDispose(callback, null, this._disposables);
  }

  public dispose(): void {
    WeChatPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) { disposable.dispose(); }
    }
  }
}

// =========================================================================
// WeChatSidebarProvider — Activity Bar WebView
// =========================================================================

export class WeChatSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codeClawVscodeSidebar';
  private _view?: vscode.WebviewView;
  private _state: ViewState = DISCONNECTED_STATE;
  private _stateVersion = 0;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _onConnect: () => void,
    private readonly _onDisconnect: () => void,
    private readonly _onRebind: () => void,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Render with current state — no race condition
    webviewView.webview.html = getWebviewHtml('sidebar', this._state);

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'connect':
          this._onConnect();
          break;
        case 'disconnect':
          this._onDisconnect();
          break;
        case 'rebind':
          this._onRebind();
          break;
      }
    });
  }

  /** Update the internal state and push to WebView immediately. */
  public setViewState(state: ViewState): void {
    this._state = state;
    this._stateVersion++;
    // Full re-render — all state is embedded in HTML, no stale DOM
    if (this._view) {
      this._view.webview.html = getWebviewHtml('sidebar', state, this._stateVersion);
    }
  }

  public showQrCode(dataUri: string): void {
    this._state = { ...this._state, showQr: true, showConnect: false, qrDataUri: dataUri };
    this.setViewState(this._state);
  }

  public hideQrCode(): void {
    this._state = { ...this._state, showQr: false };
    this.setViewState(this._state);
  }

  public showConnectButton(): void {
    this._state = { ...this._state, showConnect: true, showDisconnect: false };
    this.setViewState(this._state);
  }

  public updateStatus(status: string): void {
    this._state.status = status;
    this.setViewState(this._state);
  }
}

// =========================================================================
// Shared HTML generator — state is embedded directly, no race conditions
// =========================================================================

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getWebviewHtml(mode: 'full' | 'sidebar', state: ViewState, stateVersion?: number): string {
  const padding = mode === 'sidebar' ? '12px' : '20px';
  const titleSize = mode === 'sidebar' ? '1.2em' : '1.5em';
  return /*html*/ `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Code Claw</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: ${padding};
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .header { width: 100%; text-align: center; margin-bottom: 20px; }
    .header h1 { font-size: ${titleSize}; margin-bottom: 4px; }
    .status-bar {
      width: 100%; padding: 8px 12px; background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground); border-radius: 4px; margin-bottom: 16px;
      text-align: center; font-size: 0.85em;
    }
    .status-dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      margin-right: 6px; vertical-align: middle;
    }
    .status-dot.disconnected { background-color: #888; }
    .status-dot.connecting { background-color: #f0ad4e; animation: pulse 1.5s infinite; }
    .status-dot.connected { background-color: #5cb85c; }
    .status-dot.error { background-color: #d9534f; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    .qr-container { display: none; flex-direction: column; align-items: center; gap: 12px; }
    .qr-container.visible { display: flex; }
    .qr-container img { border: 1px solid var(--vscode-panel-border); border-radius: 6px; max-width: 260px; }
    .qr-hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
    .btn-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; justify-content: center; }
    button {
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; padding: 6px 16px; border-radius: 3px; cursor: pointer;
      font-size: 0.9em; font-family: inherit;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .help-text {
      color: var(--vscode-descriptionForeground); font-size: 0.8em;
      text-align: center; margin-top: 16px; line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="header"><h1>🦞 Code Claw</h1></div>

  <div class="status-bar">
    <span class="status-dot ${esc(state.dotClass)}"></span>
    <span id="statusText">${esc(state.status)}</span>
  </div>

  <div class="qr-container ${state.showQr ? 'visible' : ''}" id="qrContainer">
    <img id="qrImage" alt="微信绑定二维码" ${state.qrDataUri ? 'src="' + esc(state.qrDataUri) + '"' : ''} />
    <div class="qr-hint">请使用微信扫描上方二维码</div>
  </div>

  <div class="btn-row">
    <button id="connectBtn" onclick="sendCmd('connect')" style="display:${state.showConnect ? '' : 'none'}">${esc(state.connectLabel || '🔗 连接IM应用')}</button>
    <button id="disconnectBtn" class="secondary" onclick="sendCmd('disconnect')" style="display:${state.showDisconnect ? '' : 'none'}">断开连接</button>
    <button id="rebindBtn" class="secondary" onclick="sendCmd('rebind')" style="display:${state.showDisconnect || state.showRebind ? '' : 'none'}">切换渠道</button>
  </div>

  <div class="help-text">
    连接IM应用后，可在 IM 中发送消息操作当前项目。<br/>
    发送 /help 查看可用命令。
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function sendCmd(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
}
