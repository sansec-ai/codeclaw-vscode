import * as vscode from 'vscode';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Logger for the VSCode extension.
 * Uses the VSCode output channel instead of file-based logging.
 * Respects `codeClaw.logLevel` setting (default: INFO).
 */
export class ExtensionLogger {
  private outputChannel: vscode.OutputChannel;
  private level: LogLevel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.level = this.readLogLevel();
  }

  private readLogLevel(): LogLevel {
    const val = vscode.workspace
      .getConfiguration('codeClaw')
      .get<string>('logLevel', 'INFO')
      .toUpperCase();
    if (val in LOG_LEVEL_PRIORITY) {
      return val as LogLevel;
    }
    return 'INFO';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private log(level: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level as LogLevel)) { return; }
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
