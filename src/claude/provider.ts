import {
  query,
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKResultMessage,
  type SDKUserMessage,
  type Options,
  type CanUseTool,
  type PermissionResult,
} from '@anthropic-ai/claude-agent-sdk';
import * as vscode from 'vscode';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Content block types that can appear in an assistant message */
export type AssistantContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: string }
  | { kind: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/** An intermediate assistant message pushed to the caller during streaming */
export interface IntermediateMessage {
  type: 'assistant' | 'tool_progress' | 'tool_result';
  /** Human-readable line for WeChat (already formatted, no markdown) */
  displayText: string;
  /** Raw content blocks (for logging / advanced use) */
  blocks?: AssistantContentBlock[];
  /** Raw SDK message — for checklist tracking and other advanced use */
  rawMessage?: SDKAssistantMessage;
}

export interface QueryOptions {
  prompt: string;
  cwd: string;
  resume?: string;
  model?: string;
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
  images?: Array<{
    type: 'image';
    source: { type: 'base64'; media_type: string; data: string };
  }>;
  /** Enable streaming intermediate messages to WeChat */
  streaming?: boolean;
  /** Called for each intermediate assistant message when streaming=true */
  onIntermediate?: (msg: IntermediateMessage) => Promise<void>;
  onPermissionRequest?: (toolName: string, toolInput: string) => Promise<boolean>;
}

export interface QueryResult {
  text: string;
  sessionId: string;
  error?: string;
  /** Tools that were denied by the permission system */
  permissionDenials?: Array<{ tool_name: string; tool_use_id: string }>;
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

type EnvVar = { name: string; value: string };

function readEnvVarArray(config: vscode.WorkspaceConfiguration, key: string): EnvVar[] {
  const list = config.get<EnvVar[]>(key);
  if (!Array.isArray(list)) { return []; }
  return list.filter(
    (item): item is EnvVar =>
      item && typeof item.name === 'string' && typeof item.value === 'string',
  );
}

/**
 * Build env for the Claude Code subprocess.
 * Priority: codeClaw > claudeCode > process.env
 */
function buildSubprocessEnv(): Record<string, string | undefined> {
  const env: Record<string, string> = { ...process.env as Record<string, string> };

  // Use null scope to ensure settings are read correctly in SSH remote mode
  const config = (section: string) => vscode.workspace.getConfiguration(section, null);

  // claudeCode.environmentVariables (fallback)
  const claudeEnv = readEnvVarArray(config('claudeCode'), 'environmentVariables');
  for (const { name, value } of claudeEnv) { env[name] = value; }
  if (claudeEnv.length > 0) {
    logger.info('Using claudeCode.environmentVariables', { keys: claudeEnv.map((e) => e.name) });
  }

  // codeClaw.environmentVariables (override)
  const wechatEnv = readEnvVarArray(config('codeClaw'), 'environmentVariables');
  if (wechatEnv.length > 0) {
    logger.info('Using codeClaw.environmentVariables', { keys: wechatEnv.map((e) => e.name) });
  }
  for (const { name, value } of wechatEnv) { env[name] = value; }

  // Log (masked — hide all values for sensitive variable prefixes)
  const sensitivePrefixes = ['TOKEN', 'KEY', 'SECRET', 'PASSWORD', 'PASSWD', 'CREDENTIAL', 'AUTH'];
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    const upper = k.toUpperCase();
    const isSensitive = sensitivePrefixes.some(p => upper.includes(p));
    // Also mask all ANTHROPIC_* and CLAUDE_* values (except known non-secret vars)
    const isAnthropic = upper.startsWith('ANTHROPIC') || upper.startsWith('CLAUDE');
    const isKnownNonSecret = ['ANTHROPIC_MODEL', 'ANTHROPIC_BASE_URL', 'CLAUDE_AGENT_SDK_VERSION'].includes(upper);

    if ((isSensitive || isAnthropic) && !isKnownNonSecret && v) {
      masked[k] = v.length > 8 ? `${v.slice(0, 6)}...` : '***';
    } else {
      masked[k] = v || '(empty)';
    }
  }
  
  // Filter to only show ANTHROPIC and CLAUDE prefixed variables
  const filteredMasked: Record<string, string> = {};
  for (const [k, v] of Object.entries(masked)) {
    const upper = k.toUpperCase();
    if (upper.startsWith('ANTHROPIC') || upper.startsWith('CLAUDE')) {
      filteredMasked[k] = v;
    }
  }
  
  logger.info('Claude Code subprocess env', { env: JSON.stringify(filteredMasked).length > 200 ? `${JSON.stringify(filteredMasked).substring(0, 200)}...` : JSON.stringify(filteredMasked) });

  return env;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return path to the bundled Claude Code CLI.
 * Only uses the cli.js shipped inside the .vsix — no system deps.
 */
function findClaudeCliPath(): string {
  const path = require('path') as typeof import('path');
  const fs = require('fs') as typeof import('fs');

  const bundledPath = path.join(__dirname, 'claude-code', 'cli.js');
  if (fs.existsSync(bundledPath)) {
    logger.info('Using bundled Claude Code CLI', { path: bundledPath });
    return bundledPath;
  }

  throw new Error(
    `Claude Code CLI not found at ${bundledPath}. ` +
    `Please reinstall the extension.`
  );
}

function extractText(msg: SDKAssistantMessage): string {
  const content = msg.message?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => (block.text as string) ?? '')
    .join('');
}

/**
 * Extract typed content blocks from an assistant message.
 */
function extractBlocks(msg: SDKAssistantMessage): AssistantContentBlock[] {
  const content = msg.message?.content;
  if (!Array.isArray(content)) return [];
  const blocks: AssistantContentBlock[] = [];
  for (const block of content) {
    switch (block.type) {
      case 'text':
        blocks.push({ kind: 'text', text: (block.text as string) ?? '' });
        break;
      case 'tool_use':
        blocks.push({
          kind: 'tool_use',
          id: block.id,
          name: block.name,
          input: JSON.stringify(block.input ?? {}),
        });
        break;
      case 'tool_result':
        blocks.push({
          kind: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content ?? ''),
          is_error: block.is_error as boolean | undefined,
        });
        break;
    }
  }
  return blocks;
}

/**
 * Format assistant content blocks into WeChat-friendly plain text.
 */
function formatBlocksForWeChat(blocks: AssistantContentBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case 'text':
        if (block.text.trim()) {
          lines.push(plainText(block.text));
        }
        break;
      case 'tool_use': {
        const inputPreview = block.input.length > 200
          ? block.input.slice(0, 200) + '...'
          : block.input;
        lines.push(`🔧 ${block.name}\n${plainText(inputPreview)}`);
        break;
      }
      case 'tool_result': {
        const status = block.is_error ? '❌' : '✅';
        const preview = block.content.length > 300
          ? block.content.slice(0, 300) + '...'
          : block.content;
        lines.push(`${status} ${plainText(preview)}`);
        break;
      }
    }
  }
  return lines.join('\n');
}

/**
 * Strip markdown formatting for WeChat plain text rendering.
 * Converts: code blocks, inline code, bold, italic, headers, lists, links.
 */
function plainText(md: string): string {
  let s = md;
  // Code blocks → indented text
  s = s.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code: string) =>
    '\n' + code.trim().split('\n').map(l => '  ' + l).join('\n') + '\n');
  // Inline code
  s = s.replace(/`([^`]+)`/g, '$1');
  // Headers
  s = s.replace(/^#{1,6}\s+/gm, '');
  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, '$1');
  // Italic
  s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1');
  // Strikethrough
  s = s.replace(/~~(.+?)~~/g, '$1');
  // Links [text](url) → text (url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
  // Images
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[$1]');
  // Bullet lists
  s = s.replace(/^\s*[-*+]\s+/gm, '• ');
  // Numbered lists
  s = s.replace(/^\s*\d+\.\s+/gm, (match) => match);
  // Horizontal rules
  s = s.replace(/^[-*_]{3,}\s*$/gm, '────────');
  // Collapse multiple blank lines
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function getSessionId(msg: SDKMessage): string | undefined {
  if ('session_id' in msg) {
    return (msg as { session_id: string }).session_id;
  }
  return undefined;
}

async function* singleUserMessage(
  text: string,
  images?: QueryOptions['images'],
): AsyncGenerator<SDKUserMessage, void, unknown> {
  const contentBlocks: Array<{
    type: string;
    text?: string;
    source?: { type: 'base64'; media_type: string; data: string };
  }> = [{ type: 'text', text }];

  if (images?.length) {
    for (const img of images) {
      contentBlocks.push({ type: 'image', source: img.source });
    }
  }

  yield {
    type: 'user',
    session_id: '',
    parent_tool_use_id: null,
    message: { role: 'user', content: contentBlocks },
  };
}

// ---------------------------------------------------------------------------
// Core query function
// ---------------------------------------------------------------------------

export async function claudeQuery(options: QueryOptions): Promise<QueryResult> {
  const {
    prompt,
    cwd,
    resume,
    model,
    permissionMode,
    images,
    streaming = false,
    onIntermediate,
    onPermissionRequest,
  } = options;

  logger.info('Starting Claude Agent SDK query', {
    cwd,
    model,
    permissionMode,
    resume: !!resume,
    hasImages: !!images?.length,
    streaming,
  });

  const hasImages = images && images.length > 0;
  const promptParam: string | AsyncIterable<SDKUserMessage> = hasImages
    ? singleUserMessage(prompt, images)
    : prompt;

  const sdkOptions: Options = {
    cwd,
    permissionMode: permissionMode as Options['permissionMode'],
    settingSources: ['user', 'project'],
    env: buildSubprocessEnv(),
    includePartialMessages: streaming,
    stderr: (data: string) => {
      logger.debug('Claude Code stderr', { data: data.slice(0, 500) });
    },
  };

  // Use bundled Claude Code CLI
  sdkOptions.pathToClaudeCodeExecutable = findClaudeCliPath();

  if (model) sdkOptions.model = model;
  if (resume) sdkOptions.resume = resume;

  // Permission callback
  if (onPermissionRequest) {
    const canUseTool: CanUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      opts: { signal: AbortSignal },
    ): Promise<PermissionResult> => {
      const inputStr = JSON.stringify(input);
      logger.info('Permission request from SDK', { toolName });
      try {
        const allowed = await onPermissionRequest(toolName, inputStr);
        if (allowed) {
          return { behavior: 'allow', updatedInput: input };
        }
        return { behavior: 'deny', message: 'Permission denied by user.', interrupt: true };
      } catch (err) {
        logger.error('Permission handler error', { toolName, err });
        return { behavior: 'deny', message: 'Permission check failed.', interrupt: true };
      }
    };
    sdkOptions.canUseTool = canUseTool;
  }

  // Execute query & accumulate output
  let sessionId = '';
  const textParts: string[] = [];
  let errorMessage: string | undefined;
  let lastAssistantMsg: SDKAssistantMessage | undefined;
  const permissionDenials: Array<{ tool_name: string; tool_use_id: string }> = [];

  try {
    const result = query({ prompt: promptParam, options: sdkOptions });

    for await (const message of result) {
      const sid = getSessionId(message);
      if (sid) sessionId = sid;

      switch (message.type) {
        case 'assistant': {
          lastAssistantMsg = message as SDKAssistantMessage;
          const text = extractText(lastAssistantMsg);
          if (text) textParts.push(text);

          // Stream intermediate messages to WeChat
          if (streaming && onIntermediate) {
            const blocks = extractBlocks(lastAssistantMsg);
            if (blocks.length > 0) {
              const displayText = formatBlocksForWeChat(blocks);
              if (displayText) {
                try {
                  await onIntermediate({ type: 'assistant', displayText, blocks, rawMessage: lastAssistantMsg });
                } catch (cbErr) {
                  // Don't let callback failure break the query loop
                  logger.error('onIntermediate callback failed', {
                    error: cbErr instanceof Error ? cbErr.message : String(cbErr),
                  });
                }
              }
            }
          }
          break;
        }
        case 'tool_progress': {
          // SDKToolProgressMessage
          if (streaming && onIntermediate) {
            const tp = message as any;
            try {
              await onIntermediate({
                type: 'tool_progress',
                displayText: `⏳ ${tp.tool_name} (${tp.elapsed_time_seconds?.toFixed(1) ?? '?'}s)`,
              });
            } catch (cbErr) {
              logger.error('onIntermediate callback failed (tool_progress)', {
                error: cbErr instanceof Error ? cbErr.message : String(cbErr),
              });
            }
          }
          break;
        }
        case 'result': {
          const rm = message as SDKResultMessage;
          // Capture permission denials regardless of success/error
          if ('permission_denials' in rm && rm.permission_denials.length > 0) {
            for (const pd of rm.permission_denials) {
              permissionDenials.push({
                tool_name: pd.tool_name,
                tool_use_id: pd.tool_use_id,
              });
            }
            logger.warn('Permission denials detected', {
              count: rm.permission_denials.length,
              tools: rm.permission_denials.map(d => d.tool_name),
            });
          }
          if (rm.subtype === 'success' && 'result' in rm) {
            if (rm.result) {
              // The result text is often identical to the last assistant text.
              // Use trimmed comparison for robust deduplication (whitespace may differ).
              const trimmedResult = rm.result.trim();
              let deduped = false;
              if (trimmedResult && textParts.length > 0) {
                const lastPart = textParts[textParts.length - 1].trim();
                if (lastPart === trimmedResult
                  || lastPart.endsWith(trimmedResult)
                  || trimmedResult.endsWith(lastPart)
                  || trimmedResult.includes(lastPart)) {
                  // Result duplicates the last assistant text — replace with canonical result
                  textParts[textParts.length - 1] = rm.result;
                  deduped = true;
                  logger.debug('Deduped result vs last assistant text', {
                    resultLen: trimmedResult.length,
                    lastPartLen: lastPart.length,
                  });
                }
              }
              if (!deduped) {
                textParts.push(rm.result);
              }
            }
          } else if ('errors' in rm && rm.errors.length > 0) {
            errorMessage = rm.errors.join('; ');
            logger.error('SDK returned error result', { errors: rm.errors });
          }
          break;
        }
        case 'system':
          logger.debug('SDK system message', {
            subtype: (message as { subtype?: string }).subtype,
          });
          break;
        default:
          break;
      }
    }
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Claude query threw', { error: errorMessage });
  }

  const fullText = textParts.join('\n').trim();
  if (!fullText && !errorMessage) {
    errorMessage = 'Claude returned an empty response.';
  }

  logger.info('Claude SDK query completed', {
    sessionId,
    textLength: fullText.length,
    hasError: !!errorMessage,
  });

  return { text: fullText, sessionId, error: errorMessage, permissionDenials };
}

// Re-export plainText for use in extension.ts
export { plainText };
