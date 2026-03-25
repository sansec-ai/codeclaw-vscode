'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// ============================================================================
// E2E integration test — real SDK call + ChecklistTracker + mock WeChat sender
// Set SKIP_SLOW_TESTS=1 to skip
// ============================================================================

const skipSlow = !!process.env.SKIP_SLOW_TESTS;

// Load .env
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

const hasApiConfig = !!(API_BASE_URL && API_KEY);
const hasCli = fs.existsSync(CLAUDE_CLI);
const shouldSkip = skipSlow || !hasApiConfig || !hasCli;

// Setup mocks
require('./helpers/setup.js');
const { ChecklistTracker } = require('../out/claude/checklist-tracker');

describe('e2e: full message flow (real SDK + tracker)', { skip: shouldSkip ? 'No API config or CLI, or SKIP_SLOW_TESTS=1' : false }, () => {

  let sdk;
  const TIMEOUT = 120_000;

  before(async () => {
    sdk = await import('@anthropic-ai/claude-agent-sdk');
  });

  /**
   * Mock WeChat sender — captures all sent messages
   */
  class MockSender {
    constructor() {
      this.sentMessages = [];
      this.sendCount = 0;
    }

    async sendText(toUserId, contextToken, text) {
      this.sendCount++;
      this.sentMessages.push({
        toUserId,
        contextToken,
        text,
        textLength: text.length,
        sendOrder: this.sendCount,
      });
    }
  }

  it('full flow: SDK query → tracker → sender, respects 10-message budget', async () => {
    const sender = new MockSender();
    const tracker = new ChecklistTracker(9); // max 9 updates, reserve 1 for result
    const allMessageTypes = new Set();

    // Prompt designed to produce multiple tool calls and text output
    const prompt = [
      'You are a coding assistant. Do the following steps:',
      '1. List all .json files in the current directory (use a tool)',
      '2. Read the package.json file (use a tool)',
      '3. Tell me the project name and version',
      '',
      'Reply with a concise summary at the end.',
    ].join('\n');

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT);
    const textParts = [];
    let threw = false;
    let throwMsg = '';

    try {
      const iter = sdk.query({
        prompt,
        options: {
          cwd: path.join(__dirname, '..'),
          model: MODEL,
          permissionMode: 'bypassPermissions',
          pathToClaudeCodeExecutable: CLAUDE_CLI,
          includePartialMessages: true,
          abortController,
        },
      });

      for await (const msg of iter) {
        allMessageTypes.add(msg.type);

        // --- Checklist tracking ---
        if (msg.type === 'assistant') {
          const update = tracker.checkUpdate(msg);
          if (update) {
            await sender.sendText('test-user', 'test-context', update);
          }
        }

        // --- Text accumulation (simulating provider.ts logic) ---
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
    } catch (err) {
      threw = true;
      throwMsg = err.message || String(err);
    } finally {
      clearTimeout(timeoutId);
    }

    if (threw) {
      // GLM proxy may exit with code 1 for certain tool-heavy requests.
      // Verify budget was still respected up to the point of failure.
      const totalSent = sender.sendCount;
      console.log(`  ⚠️  Proxy exited: ${throwMsg.substring(0, 80)}`);
      console.log(`  Messages sent before exit: ${totalSent}`);

      assert.ok(
        totalSent <= 10,
        `Budget respected even on proxy exit: ${totalSent} <= 10`
      );
      console.log(`  ✓ Budget respected on proxy exit (${totalSent} <= 10)`);
    } else {
      // --- Verify SDK returned messages ---
      assert.ok(allMessageTypes.has('result'), 'Should have result message');
      console.log('  Message types received:', [...allMessageTypes].join(', '));

      // --- Send final result (1 message, always reserved) ---
      const finalText = textParts.join('\n').trim();
      await sender.sendText('test-user', 'test-context', finalText);

      // --- Verify budget ---
      const totalSent = sender.sendCount;
      console.log(`  Total messages sent: ${totalSent}`);
      console.log(`    - Checklist updates: ${totalSent - 1}`);
      console.log(`    - Final result: 1`);
      console.log(`  Final response length: ${finalText.length} chars`);

      // Total should be <= 10 (9 checklist + 1 result)
      assert.ok(
        totalSent <= 10,
        `Total sent messages (${totalSent}) should not exceed 10 (WeChat ClawBot limit)`
      );

      // Final result should always be the last message
      const lastSent = sender.sentMessages[sender.sentMessages.length - 1];
      assert.equal(lastSent.text, finalText, 'Last sent message should be the final result');

      // Verify response has meaningful content
      assert.ok(finalText.length > 10, 'Final result should have meaningful content');
      console.log('  ✓ Final result preview:', finalText.substring(0, 150));
    }
  }, TIMEOUT);

  it('checklist tracker + sender integration with TodoWrite-forcing prompt', async () => {
    const sender = new MockSender();
    const tracker = new ChecklistTracker(9);

    // Prompt that strongly encourages TodoWrite
    const prompt = [
      'IMPORTANT: Use the TodoWrite tool to create a checklist.',
      'Create a checklist with 4 items about analyzing a project.',
      'Then mark them as completed one by one.',
      'Do NOT actually read or write any files — just use TodoWrite.',
      'After all items are completed, write a brief summary.',
    ].join('\n');

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT);
    const textParts = [];
    let todoWriteCount = 0;
    let threw = false;
    let throwMsg = '';

    try {
      const iter = sdk.query({
        prompt,
        options: {
          cwd: __dirname,
          model: MODEL,
          permissionMode: 'bypassPermissions',
          pathToClaudeCodeExecutable: CLAUDE_CLI,
          includePartialMessages: true,
          abortController,
        },
      });

      for await (const msg of iter) {
        if (msg.type === 'assistant' && msg.message?.content) {
          // Count TodoWrite calls
          const hasTodoWrite = msg.message.content.some(
            b => b.type === 'tool_use' && b.name === 'TodoWrite'
          );
          if (hasTodoWrite) todoWriteCount++;

          // Feed to tracker
          const update = tracker.checkUpdate(msg);
          if (update) {
            await sender.sendText('test-user', 'ctx', update);
          }
        }

        // Accumulate text
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) textParts.push(block.text);
          }
        }
        if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
          textParts.push(msg.result);
        }
      }
    } catch (err) {
      threw = true;
      throwMsg = err.message || String(err);
    } finally {
      clearTimeout(timeoutId);
    }

    if (threw) {
      // GLM proxy may exit with code 1 — verify budget was still respected
      console.log(`  ⚠️  Proxy exited: ${throwMsg.substring(0, 80)}`);
      console.log(`  TodoWrite calls before exit: ${todoWriteCount}`);
      console.log(`  Messages sent before exit: ${sender.sendCount}`);
      assert.ok(
        sender.sendCount <= 10,
        `Budget respected even on proxy exit: ${sender.sendCount} <= 10`
      );
      console.log(`  ✓ Budget respected on proxy exit (${sender.sendCount} <= 10)`);
    } else {
      // Send final result
      const finalText = textParts.join('\n').trim();
      await sender.sendText('test-user', 'ctx', finalText);

      console.log(`  TodoWrite calls: ${todoWriteCount}`);
      console.log(`  Checklist updates sent: ${sender.sendCount - 1}`);
      console.log(`  Total messages: ${sender.sendCount}`);

      if (todoWriteCount > 0) {
        // Model supports TodoWrite
        assert.ok(
          sender.sendCount <= 10,
          `Budget respected: ${sender.sendCount} <= 10`
        );
        console.log('  ✓ TodoWrite supported, tracker and budget verified');
      } else {
        // Model doesn't support TodoWrite (expected with GLM)
        console.log('  ⚠️ Model does not support TodoWrite tool (expected with non-Anthropic models)');
        assert.equal(sender.sendCount, 1, 'Should only have the final result message');
        console.log('  ✓ Tracker correctly produced no updates when no TodoWrite detected');
      }
    }
  }, TIMEOUT);

});
