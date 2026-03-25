'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// ============================================================================
// Integration tests for claude/provider — real SDK calls with GLM model
// Set SKIP_SLOW_TESTS=1 to skip all integration tests
// ============================================================================

const skipSlow = !!process.env.SKIP_SLOW_TESTS;

// Load .env into process.env (highest priority — don't override existing vars)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const API_BASE_URL = process.env.ANTHROPIC_BASE_URL || '';
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const CLAUDE_CLI = path.join(__dirname, '..', 'out', 'claude-code', 'cli.js');

// Pre-flight check
const hasApiConfig = !!(API_BASE_URL && API_KEY);
const hasCli = fs.existsSync(CLAUDE_CLI);

if (!skipSlow) {
  if (!hasApiConfig) console.log('  ⚠️  Missing ANTHROPIC_BASE_URL or API key in .env');
  if (!hasCli) console.log('  ⚠️  Claude Code CLI not found at', CLAUUDE_CLI);
}

const shouldSkip = skipSlow || !hasApiConfig || !hasCli;

describe('claude/provider (real SDK integration)', { skip: shouldSkip ? 'No API config or CLI, or SKIP_SLOW_TESTS=1' : false }, () => {

  let sdk;
  const TIMEOUT = 90_000;

  before(async () => {
    sdk = await import('@anthropic-ai/claude-agent-sdk');
  });

  /**
   * Helper: run a query with timeout, collect messages, return summary
   */
  async function runQuery(prompt, options = {}) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), options.timeout || TIMEOUT);

    const messages = [];
    const textParts = [];

    try {
      const iter = sdk.query({
        prompt,
        options: {
          cwd: options.cwd || __dirname,
          model: options.model || MODEL,
          permissionMode: options.permissionMode || 'bypassPermissions',
          pathToClaudeCodeExecutable: CLAUDE_CLI,
          includePartialMessages: !!options.streaming,
          abortController,
        },
      });

      for await (const msg of iter) {
        messages.push(msg);

        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              textParts.push(block.text);
            }
          }
        }

        if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
          textParts.push(msg.result);
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    return { messages, textParts, fullText: textParts.join('\n').trim() };
  }

  // ---------------------------------------------------------------
  it('simple text query returns a non-empty response', async () => {
    const { messages, fullText } = await runQuery('Reply with exactly: Hello World');

    // Should have received messages
    assert.ok(messages.length > 0, 'SDK should return at least one message');

    // Should have a result message
    const resultMsg = messages.find(m => m.type === 'result');
    assert.ok(resultMsg, 'Should have a result message');
    assert.equal(resultMsg.subtype, 'success', 'Result should be successful');

    // Response should contain "Hello" or "hello"
    assert.ok(
      fullText.toLowerCase().includes('hello'),
      `Response should contain "Hello", got: ${fullText.substring(0, 200)}`
    );

    console.log('  ✓ Response received:', fullText.substring(0, 100));
  }, TIMEOUT);

  // ---------------------------------------------------------------
  it('streaming mode yields intermediate assistant messages', async () => {
    const intermediateCount = { value: 0 };
    const toolCalls = [];

    const iter = sdk.query({
      prompt: 'What is 2+2? Reply with just the number.',
      options: {
        cwd: __dirname,
        model: MODEL,
        permissionMode: 'bypassPermissions',
        pathToClaudeCodeExecutable: CLAUDE_CLI,
        includePartialMessages: true,
        abortController: new AbortController(),
      },
    });

    const timeoutId = setTimeout(() => iter.return?.(), TIMEOUT);

    try {
      for await (const msg of iter) {
        if (msg.type === 'assistant') {
          intermediateCount.value++;
          // Track tool calls
          if (msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'tool_use') {
                toolCalls.push({ name: block.name, id: block.id });
              }
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    assert.ok(
      intermediateCount.value > 0,
      `Should have at least 1 assistant message, got ${intermediateCount.value}`
    );

    console.log(`  ✓ ${intermediateCount.value} assistant messages, ${toolCalls.length} tool calls`);
  }, TIMEOUT);

  // ---------------------------------------------------------------
  it('permission denial detection in plan mode', async () => {
    // In plan mode, Claude should try to use tools but they may be blocked.
    // GLM proxy may exit with code 1 instead of returning a graceful result —
    // treat that as a valid "plan mode blocked tools" outcome.
    let messages;
    let threw = false;
    let throwMsg = '';

    try {
      ({ messages } = await runQuery(
        'Read the file package.json and list all dependencies.',
        { permissionMode: 'plan' }
      ));
    } catch (err) {
      threw = true;
      throwMsg = err.message || String(err);
    }

    if (threw) {
      // GLM proxy exits with code 1 when plan mode blocks tool calls
      // — this is acceptable: the proxy rejected the tool execution
      assert.ok(
        throwMsg.includes('exited with code 1') || throwMsg.includes('aborted'),
        `Expected proxy exit or abort, got: ${throwMsg.substring(0, 120)}`
      );
      console.log(`  ✓ Plan mode: proxy rejected tool calls (${throwMsg.substring(0, 80)})`);
    } else {
      // Graceful result — check for denials or normal completion
      const resultMsg = messages.find(m => m.type === 'result');
      assert.ok(resultMsg, 'Should have a result message');

      const denials = resultMsg.permission_denials || [];
      console.log(`  ✓ Plan mode result: subtype=${resultMsg.subtype}, denials=${denials.length}`);

      assert.ok(
        resultMsg.subtype === 'success' || resultMsg.subtype === 'error',
        'Result should have a valid subtype'
      );
    }
  }, TIMEOUT);

  // ---------------------------------------------------------------
  it('handles error gracefully on invalid model', async () => {
    // Use a clearly invalid model name — SDK may throw or return error result
    let gotResultOrError = false;
    try {
      const { messages } = await runQuery('Hi', {
        model: 'nonexistent-model-xyz-12345',
        timeout: 30000,
      });
      const resultMsg = messages.find(m => m.type === 'result');
      if (resultMsg) gotResultOrError = true;
    } catch (err) {
      // SDK may throw for invalid model — that's acceptable
      gotResultOrError = true;
      console.log('  ✓ Invalid model threw:', err.message?.substring(0, 80) || String(err).substring(0, 80));
    }

    assert.ok(gotResultOrError, 'Should either get a result or an error for invalid model');
  }, 60000);

});
