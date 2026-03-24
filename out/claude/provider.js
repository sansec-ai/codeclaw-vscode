"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeQuery = claudeQuery;
const child_process_1 = require("child_process");
const logger_1 = require("../logger");
/**
 * Call Claude Code CLI to process a prompt.
 * Uses `claude -p <prompt> --output-format text` for non-interactive mode.
 */
async function claudeQuery(options) {
    const { prompt, cwd, resume, model, permissionMode, } = options;
    logger_1.logger.info("Starting Claude CLI query", {
        cwd,
        model,
        permissionMode,
        resume: !!resume,
    });
    const args = ['-p', prompt, '--output-format', 'text'];
    if (model) {
        args.push('--model', model);
    }
    if (resume) {
        args.push('--resume', resume);
    }
    if (permissionMode === 'plan') {
        args.push('--permission-mode', 'plan');
    }
    else if (permissionMode === 'acceptEdits') {
        args.push('--permission-mode', 'acceptEdits');
    }
    // For 'auto' mode, we still use acceptEdits and let the process run freely
    return new Promise((resolve) => {
        const proc = (0, child_process_1.execFile)('claude', args, {
            cwd,
            timeout: 300_000, // 5 minutes
            maxBuffer: 10 * 1024 * 1024,
        }, (error, stdout, stderr) => {
            if (error) {
                const errorMessage = error.message || stderr || String(error);
                logger_1.logger.error('Claude CLI query error', { error: errorMessage });
                resolve({
                    text: stdout?.trim() || '',
                    sessionId: '',
                    error: errorMessage,
                });
                return;
            }
            const text = stdout?.trim() || '';
            const sessionId = ''; // CLI doesn't expose session_id easily
            if (!text) {
                resolve({
                    text: '',
                    sessionId,
                    error: 'Claude returned an empty response.',
                });
                return;
            }
            logger_1.logger.info('Claude CLI query completed', {
                textLength: text.length,
            });
            resolve({ text, sessionId });
        });
    });
}
//# sourceMappingURL=provider.js.map