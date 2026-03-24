import { execFile, execSync } from 'child_process';
import * as vscode from 'vscode';
import { logger } from '../logger';

export interface QueryOptions {
  prompt: string;
  cwd: string;
  /** @deprecated Use continueSession instead */
  resume?: string;
  /** If true, use --continue flag for continuous conversation */
  continueSession?: boolean;
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

type EnvVar = { name: string; value: string };

/**
 * Read an array of { name, value } env var entries from a VSCode configuration.
 */
function readEnvVarArray(config: vscode.WorkspaceConfiguration, key: string): EnvVar[] {
  const list = config.get<EnvVar[]>(key);
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter(
    (item): item is EnvVar =>
      item && typeof item.name === 'string' && typeof item.value === 'string',
  );
}

/**
 * Build environment for Claude CLI.
 *
 * 加载顺序（后者覆盖前者）:
 *   1. process.env                        — 系统环境变量
 *   2. claudeCode.environmentVariables     — Claude Code 插件配置（兼容复用）
 *   3. wechat-vscode.environmentVariables  — 本插件配置（最高优先级）
 */
function buildCliEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // --- Step 1: claudeCode.environmentVariables ---
  const claudeEnv = readEnvVarArray(
    vscode.workspace.getConfiguration('claudeCode'),
    'environmentVariables',
  );
  if (claudeEnv.length > 0) {
    logger.info('Loaded claudeCode.environmentVariables', {
      keys: claudeEnv.map((e) => e.name),
    });
    for (const { name, value } of claudeEnv) {
      env[name] = value;
    }
  }

  // --- Step 2: wechat-vscode.environmentVariables（覆盖同名变量） ---
  const wechatEnv = readEnvVarArray(
    vscode.workspace.getConfiguration('wechat-vscode'),
    'environmentVariables',
  );
  if (wechatEnv.length > 0) {
    logger.info('Loaded wechat-vscode.environmentVariables', {
      keys: wechatEnv.map((e) => e.name),
    });
    for (const { name, value } of wechatEnv) {
      env[name] = value;
    }
  }

  // Log (mask sensitive values)
  const maskedEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (k.includes('TOKEN') || k.includes('KEY') || k.includes('SECRET') || k.includes('PASSWORD')) {
      maskedEnv[k] = v ? `${v.slice(0, 6)}...` : '(empty)';
    } else if (k.startsWith('ANTHROPIC') || k.startsWith('CLAUDE')) {
      maskedEnv[k] = v || '(empty)';
    }
  }
  logger.info('Claude CLI environment (final)', { env: maskedEnv });

  return env;
}

/**
 * Check if claude CLI is accessible and get its version.
 */
function checkClaudeCli(claudeCommand: string, env: NodeJS.ProcessEnv): { ok: boolean; version?: string; error?: string } {
  try {
    const version = execSync(`${claudeCommand} --version`, {
      env,
      timeout: 10_000,
      encoding: 'utf-8',
    }).trim();
    return { ok: true, version };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Call Claude Code CLI to process a prompt.
 */
export async function claudeQuery(options: QueryOptions): Promise<QueryResult> {
  const {
    prompt,
    cwd,
    resume,
    model,
    permissionMode,
  } = options;

  const claudeCommand = vscode.workspace
    .getConfiguration('wechat-vscode')
    .get<string>('claudeCommand') || 'claude';

  const env = buildCliEnv();

  logger.info('Starting Claude CLI query', {
    claudeCommand,
    cwd,
    model,
    permissionMode,
    resume: !!resume,
    promptLength: prompt.length,
  });

  // Pre-check: is claude accessible?
  const check = checkClaudeCli(claudeCommand, env);
  if (!check.ok) {
    const errMsg = `claude CLI 不可用: ${check.error}`;
    logger.error(errMsg);
    return {
      text: '',
      sessionId: '',
      error: errMsg,
    };
  }
  logger.info('Claude CLI check passed', { version: check.version });

  const args: string[] = ['-p', prompt, '--output-format', 'text'];

  if (model) {
    args.push('--model', model);
  }

  // Use --continue for continuous conversation (resumes last session)
  if (options.continueSession) {
    args.push('--continue');
  } else if (resume) {
    args.push('--resume', resume);
  }

  if (permissionMode === 'plan') {
    args.push('--permission-mode', 'plan');
  } else if (permissionMode === 'acceptEdits') {
    args.push('--permission-mode', 'acceptEdits');
  }

  return new Promise<QueryResult>((resolve) => {
    const proc = execFile(claudeCommand, args, {
      cwd,
      timeout: 300_000, // 5 minutes
      maxBuffer: 10 * 1024 * 1024,
      env,
    }, (error, stdout, stderr) => {
      if (error) {
        const stderrSnippet = (stderr || '').slice(0, 1000);
        const stdoutSnippet = (stdout || '').slice(0, 500);
        const errorMessage = `claude CLI 执行失败 (exit ${error.code || 'unknown'}):\n${stderrSnippet || error.message}`;
        logger.error('Claude CLI query error', {
          code: error.code,
          signal: error.signal,
          stderr: stderrSnippet,
          stdout: stdoutSnippet,
          error: error.message,
        });
        resolve({
          text: stdout?.trim() || '',
          sessionId: '',
          error: errorMessage,
        });
        return;
      }

      const text = stdout?.trim() || '';
      const sessionId = '';

      if (!text) {
        const stderrSnippet = (stderr || '').slice(0, 500);
        logger.warn('Claude CLI returned empty response', { stderr: stderrSnippet });
        resolve({
          text: '',
          sessionId,
          error: 'Claude 返回了空响应',
        });
        return;
      }

      logger.info('Claude CLI query completed', { textLength: text.length });
      resolve({ text, sessionId });
    });
  });
}
