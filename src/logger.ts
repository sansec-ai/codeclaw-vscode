import * as vscode from 'vscode';

/**
 * Logger for the VSCode extension.
 * Uses the VSCode output channel instead of file-based logging.
 */
export class ExtensionLogger {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  private log(level: string, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const parts = [timestamp, level, message];
    if (data !== undefined) {
      parts.push(typeof data === 'string' ? data : JSON.stringify(data));
    }
    this.outputChannel.appendLine(parts.join(' '));
  }

  info(message: string, data?: unknown): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('WARN', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('ERROR', message, data);
  }

  debug(message: string, data?: unknown): void {
    this.log('DEBUG', message, data);
  }

  show(): void {
    this.outputChannel.show();
  }
}

/** Global logger instance, set during extension activation */
export let logger: ExtensionLogger;

export function initLogger(outputChannel: vscode.OutputChannel): void {
  logger = new ExtensionLogger(outputChannel);
}
