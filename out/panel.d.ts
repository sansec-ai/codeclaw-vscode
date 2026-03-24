import * as vscode from 'vscode';
export declare class WeChatPanel {
    static currentPanel: WeChatPanel | undefined;
    private readonly _panel;
    private _disposables;
    private readonly _extensionUri;
    private static readonly VIEW_TYPE;
    static createOrShow(extensionUri: vscode.Uri): WeChatPanel;
    private constructor();
    reveal(): void;
    showQrCode(dataUri: string): void;
    hideQrCode(): void;
    showConnectButton(): void;
    updateStatus(status: string): void;
    onDidDispose(callback: () => void): void;
    dispose(): void;
    private _updateWebviewContent;
    private _getHtmlForWebview;
}
