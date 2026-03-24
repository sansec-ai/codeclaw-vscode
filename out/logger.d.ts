import * as vscode from 'vscode';
/**
 * Logger for the VSCode extension.
 * Uses the VSCode output channel instead of file-based logging.
 */
export declare class ExtensionLogger {
    private outputChannel;
    constructor(outputChannel: vscode.OutputChannel);
    private log;
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
    debug(message: string, data?: unknown): void;
    show(): void;
}
/** Global logger instance, set during extension activation */
export declare let logger: ExtensionLogger;
export declare function initLogger(outputChannel: vscode.OutputChannel): void;
