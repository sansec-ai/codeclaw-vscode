import { execFile } from 'child_process';
import { logger } from '../logger';

export interface QueryOptions {
  prompt: string;
  cwd: string;
  resume?: string;
  model?: string;
  permissionMode?: string;
  images?: Array<{
    type: "image";
    source: { type: "base64"; media_type: string; data: string };
  }>;
}

export interface QueryResult {
  text: string;
  sessionId: string;
  error?: string;
}

/**
 * Call Claude Code CLI to process a prompt.
 * Uses `claude -p <prompt> --output-format text` for non-interactive mode.
 */
export async function claudeQuery(options: QueryOptions): Promise<QueryResult> {
  const {
    prompt,
    cwd,
    resume,
    model,
    permissionMode,
  } = options;

  logger.info("Starting Claude CLI query", {
    cwd,
    model,
    permissionMode,
    resume: !!resume,
  });

  const args: string[] = ['-p', prompt, '--output-format', 'text'];

  if (model) {
    args.push('--model', model);
  }

  if (resume) {
    args.push('--resume', resume);
  }

  if (permissionMode === 'plan') {
    args.push('--permission-mode', 'plan');
  } else if (permissionMode === 'acceptEdits') {
    args.push('--permission-mode', 'acceptEdits');
  }
  // For 'auto' mode, we still use acceptEdits and let the process run freely

  return new Promise<QueryResult>((resolve) => {
    const proc = execFile('claude', args, {
      cwd,
      timeout: 300_000, // 5 minutes
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        const errorMessage = error.message || stderr || String(error);
        logger.error('Claude CLI query error', { error: errorMessage });
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

      logger.info('Claude CLI query completed', {
        textLength: text.length,
      });

      resolve({ text, sessionId });
    });
  });
}
