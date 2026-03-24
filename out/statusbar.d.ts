import * as vscode from 'vscode';
type ConnectionStatus = 'disconnected' | 'connecting' | 'scanning' | 'connected' | 'processing' | 'error';
export declare class StatusBarManager implements vscode.Disposable {
    private statusBarItem;
    private currentStatus;
    constructor();
    setStatus(status: ConnectionStatus): void;
    private applyStatus;
    dispose(): void;
}
export {};
