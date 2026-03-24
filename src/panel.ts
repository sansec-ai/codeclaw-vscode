import * as vscode from 'vscode';

export class WeChatPanel {
  public static currentPanel: WeChatPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private readonly _extensionUri: vscode.Uri;

  private static readonly VIEW_TYPE = 'wechatClaudeCode';

  public static createOrShow(extensionUri: vscode.Uri): WeChatPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (WeChatPanel.currentPanel) {
      WeChatPanel.currentPanel._panel.reveal(column);
      return WeChatPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      WeChatPanel.VIEW_TYPE,
      'WeChat Claude Code',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    WeChatPanel.currentPanel = new WeChatPanel(panel, extensionUri);
    return WeChatPanel.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set initial HTML
    this._updateWebviewContent();

    // Handle panel dispose
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'connect':
            vscode.commands.executeCommand('wechat-vscode.connect');
            break;
          case 'disconnect':
            vscode.commands.executeCommand('wechat-vscode.disconnect');
            break;
        }
      },
      null,
      this._disposables,
    );
  }

  public reveal(): void {
    this._panel.reveal();
  }

  public showQrCode(dataUri: string): void {
    this._panel.webview.postMessage({ command: 'showQrCode', dataUri });
  }

  public hideQrCode(): void {
    this._panel.webview.postMessage({ command: 'hideQrCode' });
  }

  public showConnectButton(): void {
    this._panel.webview.postMessage({ command: 'showConnectButton' });
  }

  public updateStatus(status: string): void {
    this._panel.webview.postMessage({ command: 'updateStatus', status });
  }

  public onDidDispose(callback: () => void): void {
    this._panel.onDidDispose(callback, null, this._disposables);
  }

  public dispose(): void {
    WeChatPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _updateWebviewContent(): void {
    const webview = this._panel.webview;
    const html = this._getHtmlForWebview();
    webview.html = html;
  }

  private _getHtmlForWebview(): string {
    return /*html*/ `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>WeChat Claude Code</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }

    .header {
      width: 100%;
      text-align: center;
      margin-bottom: 24px;
    }

    .header h1 {
      font-size: 1.5em;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }

    .status-bar {
      width: 100%;
      padding: 10px 16px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 6px;
      margin-bottom: 24px;
      text-align: center;
      font-size: 0.9em;
    }

    .status-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 8px;
      vertical-align: middle;
    }

    .status-dot.disconnected { background-color: #888; }
    .status-dot.connecting { background-color: #f0ad4e; animation: pulse 1.5s infinite; }
    .status-dot.connected { background-color: #5cb85c; }
    .status-dot.error { background-color: #d9534f; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .qr-container {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .qr-container.visible {
      display: flex;
    }

    .qr-container img {
      border: 2px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
      border-radius: 8px;
      max-width: 300px;
    }

    .qr-hint {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }

    .connect-btn-container {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }

    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 10px 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1em;
      font-family: inherit;
      transition: background 0.2s;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .log-section {
      width: 100%;
      margin-top: 24px;
    }

    .log-section h3 {
      font-size: 1em;
      margin-bottom: 8px;
      color: var(--vscode-descriptionForeground);
    }

    .log-content {
      background: var(--vscode-textCodeBlock-background);
      border-radius: 6px;
      padding: 12px;
      max-height: 200px;
      overflow-y: auto;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .help-text {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      text-align: center;
      margin-top: 24px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🦞 WeChat Claude Code</h1>
  </div>

  <div class="status-bar" id="statusBar">
    <span class="status-dot disconnected" id="statusDot"></span>
    <span id="statusText">未连接</span>
  </div>

  <div class="qr-container" id="qrContainer">
    <img id="qrImage" alt="微信绑定二维码" />
    <div class="qr-hint">请使用微信扫描上方二维码</div>
  </div>

  <div class="connect-btn-container" id="connectBtns">
    <button id="connectBtn" onclick="sendCommand('connect')">🔗 连接微信</button>
    <button class="secondary" id="disconnectBtn" onclick="sendCommand('disconnect')" style="display:none;">断开连接</button>
  </div>

  <div class="help-text">
    连接微信后，可以在微信中发送消息来操作当前项目。<br/>
    Claude Code 将处理你的请求并返回结果。
  </div>

  <div class="log-section" id="logSection" style="display:none;">
    <h3>📋 消息日志</h3>
    <div class="log-content" id="logContent"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function sendCommand(cmd) {
      vscode.postMessage({ command: cmd });
    }

    let logLines = [];

    function addLog(line) {
      const now = new Date().toLocaleTimeString('zh-CN');
      logLines.push('[' + now + '] ' + line);
      if (logLines.length > 100) logLines.shift();
      const el = document.getElementById('logContent');
      if (el) el.textContent = logLines.join('\\n');
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.command) {
        case 'showQrCode':
          document.getElementById('qrImage').src = msg.dataUri;
          document.getElementById('qrContainer').classList.add('visible');
          document.getElementById('connectBtn').style.display = 'none';
          addLog('二维码已生成，等待扫描...');
          break;
        case 'hideQrCode':
          document.getElementById('qrContainer').classList.remove('visible');
          break;
        case 'showConnectButton':
          document.getElementById('connectBtn').style.display = '';
          document.getElementById('disconnectBtn').style.display = 'none';
          break;
        case 'updateStatus':
          document.getElementById('statusText').textContent = msg.status;
          addLog(msg.status);

          const dot = document.getElementById('statusDot');
          dot.className = 'status-dot';

          if (msg.status.includes('连接') || msg.status.includes('连接') || msg.status.includes('绑定成功') || msg.status.includes('已连接')) {
            if (msg.status.includes('正在') || msg.status.includes('处理') || msg.status.includes('扫描')) {
              dot.classList.add('connecting');
            } else if (msg.status.includes('失败') || msg.status.includes('过期') || msg.status.includes('断开')) {
              dot.classList.add('error');
              document.getElementById('disconnectBtn').style.display = 'none';
              document.getElementById('connectBtn').style.display = '';
            } else {
              dot.classList.add('connected');
              document.getElementById('disconnectBtn').style.display = '';
              document.getElementById('connectBtn').style.display = 'none';
            }
          } else if (msg.status === '未连接') {
            dot.classList.add('disconnected');
          } else if (msg.status.includes('处理')) {
            dot.classList.add('connecting');
          } else if (msg.status.includes('错误') || msg.status.includes('失败')) {
            dot.classList.add('error');
          }

          // Show log section when there are logs
          if (logLines.length > 0) {
            document.getElementById('logSection').style.display = '';
          }
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
