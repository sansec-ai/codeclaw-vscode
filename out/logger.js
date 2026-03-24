"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.ExtensionLogger = void 0;
exports.initLogger = initLogger;
/**
 * Logger for the VSCode extension.
 * Uses the VSCode output channel instead of file-based logging.
 */
class ExtensionLogger {
    outputChannel;
    constructor(outputChannel) {
        this.outputChannel = outputChannel;
    }
    log(level, message, data) {
        const timestamp = new Date().toISOString();
        const parts = [timestamp, level, message];
        if (data !== undefined) {
            parts.push(typeof data === 'string' ? data : JSON.stringify(data));
        }
        this.outputChannel.appendLine(parts.join(' '));
    }
    info(message, data) {
        this.log('INFO', message, data);
    }
    warn(message, data) {
        this.log('WARN', message, data);
    }
    error(message, data) {
        this.log('ERROR', message, data);
    }
    debug(message, data) {
        this.log('DEBUG', message, data);
    }
    show() {
        this.outputChannel.show();
    }
}
exports.ExtensionLogger = ExtensionLogger;
function initLogger(outputChannel) {
    exports.logger = new ExtensionLogger(outputChannel);
}
//# sourceMappingURL=logger.js.map