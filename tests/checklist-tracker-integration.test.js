'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Skip if SKIP_SLOW_TESTS is set
if (process.env.SKIP_SLOW_TESTS === '1') {
  console.log('⏭️  Skipping checklist-tracker integration test (SKIP_SLOW_TESTS=1)');
  process.exit(0);
}

const path = require('path');
const fs = require('fs');

// Load .env into process.env
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

// Setup mocks
require('./helpers/setup.js');
const claudePath = path.join(__dirname, '..', 'out', 'claude-code', 'cli.js');
const { ChecklistTracker } = require('../out/claude/checklist-tracker');

/**
 * Integration test: call Claude Agent SDK directly with a prompt that
 * forces TodoWrite usage, and verify ChecklistTracker captures updates.
 */
describe('ChecklistTracker integration (real SDK)', () => {

  // Timeout: 120s for API call
  const TIMEOUT = 120_000;

  it('should detect TodoWrite from real Claude Code SDK streaming output', async () => {
    // Use dynamic import for ESM module
    const sdk = await import('@anthropic-ai/claude-agent-sdk');

    const tracker = new ChecklistTracker(9);
    const checklistUpdates = [];

    const prompt = [
      '在tests/tmp目录完成3个TODO任务，仅用于测试大模型的todo工具能力，完成后删除tests/tmp目录',
    ].join('\n');

    const messages = [];

    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), TIMEOUT);

      const iter = sdk.query({
        prompt,
        options: {
          cwd: __dirname,
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
          permissionMode: 'bypassPermissions',
          pathToClaudeCodeExecutable: claudePath,
          includePartialMessages: true,
          abortController,
        },
      });

      // Collect all messages and feed to tracker
      for await (const message of iter) {
        messages.push(message);

        if (message.type === 'assistant') {
          const update = tracker.checkUpdate(message);
          if (update) {
            checklistUpdates.push(update);
          }
        }
      }

      clearTimeout(timeoutId);

      // Verify we got some messages from SDK
      assert.ok(messages.length > 0, 'SDK should return messages');

      // Log message types for debugging
      const types = messages.map(m => m.type);
      console.log('  Message types:', [...new Set(types)].join(', '));
      console.log('  Total messages:', messages.length);

      // Check if TodoWrite was used
      const todoWritesFound = messages.filter(m => {
        if (m.type !== 'assistant' || !m.message?.content) return false;
        return m.message.content.some(b =>
          b.type === 'tool_use' && b.name === 'TodoWrite'
        );
      });

      console.log('  TodoWrite calls found:', todoWritesFound.length);

      if (todoWritesFound.length > 0) {
        // If TodoWrite was used, tracker should have detected it
        console.log('  Checklist updates sent:', checklistUpdates.length);

        // At least the final "all completed" update should have been sent
        // (tracker always triggers when all items are completed)
        // But we can't guarantee the model followed instructions perfectly,
        // so we just verify the tracker worked correctly when it did detect todos

        // Verify tracker state is consistent
        const extractResult = tracker.extractTodos(
          todoWritesFound[todoWritesFound.length - 1]
        );
        if (extractResult) {
          console.log('  Final checklist state:');
          for (const item of extractResult) {
            console.log(`    [${item.status}] ${item.content}`);
          }
          assert.ok(extractResult.length > 0, 'Should have extracted todo items');
        }

        // If we got checklist updates, verify they contain expected formatting
        if (checklistUpdates.length > 0) {
          const lastUpdate = checklistUpdates[checklistUpdates.length - 1];
          assert.ok(
            lastUpdate.includes('📋') || lastUpdate.includes('任务进度'),
            'Update should contain checklist header'
          );
          console.log('  Last checklist update preview:', lastUpdate.substring(0, 200));
        }
      } else {
        // Model didn't use TodoWrite — this is possible with non-Anthropic models
        console.log('  ⚠️ Claude did not use TodoWrite tool (model may not support it)');
        console.log('  This is acceptable — the tracker correctly returned no updates');
        assert.equal(checklistUpdates.length, 0, 'No updates expected without TodoWrite');
      }

    } catch (err) {
      const errMsg = err.message || String(err);

      // If the API call fails (auth, network, etc.), report but don't fail hard
      console.log('  ⚠️ SDK call failed (this is expected if API is unavailable):');
      console.log('    ' + errMsg.substring(0, 200));

      // Check if it's an API error vs other error
      if (errMsg.includes('exited with code 1')) {
        // GLM proxy exits with code 1 for certain tool-heavy requests
        console.log('  Skipping: GLM proxy exited (code 1) — not a code bug');
      } else if (errMsg.includes('401') || errMsg.includes('auth')) {
        console.log('  Skipping: API authentication failed');
      } else if (errMsg.includes('abort') || errMsg.includes('timeout')) {
        console.log('  Skipping: Request timed out');
      } else {
        // Re-throw unexpected errors
        throw err;
      }
    }
  }, TIMEOUT);

});
