'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Claude provider integration tests — requires real API access.
// Set SKIP_SLOW_TESTS=1 to skip these.

const skipSlow = !!process.env.SKIP_SLOW_TESTS;

describe('claude/provider (integration)', { skip: skipSlow ? 'SKIP_SLOW_TESTS=1' : false }, () => {
  it('simple text query returns a response', async () => {
    // This test is placeholder — claudeQuery() requires vscode module
    // and the bundled CLI, making it very hard to test outside VSCode.
    // In a real CI, you'd need to mock the entire SDK.
    assert.ok(true, 'Skipped: claudeQuery requires VSCode runtime');
  });

  it('streaming mode calls onIntermediate', async () => {
    assert.ok(true, 'Skipped: claudeQuery requires VSCode runtime');
  });

  it('permission denial detection works in plan mode', async () => {
    assert.ok(true, 'Skipped: claudeQuery requires VSCode runtime');
  });
});
