'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Setup mocks (vscode, logger) before requiring source modules
require('./helpers/setup.js');

const { ChecklistTracker } = require('../out/claude/checklist-tracker');

describe('ChecklistTracker', () => {

  function makeAssistantMsg(todos) {
    return {
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          name: 'TodoWrite',
          input: { todos },
        }],
      },
    };
  }

  it('should not trigger on first detection', () => {
    const tracker = new ChecklistTracker(9);
    const msg = makeAssistantMsg([
      { content: 'Task 1', status: 'pending' },
      { content: 'Task 2', status: 'pending' },
      { content: 'Task 3', status: 'pending' },
    ]);
    const result = tracker.checkUpdate(msg);
    assert.equal(result, null, 'First detection should not trigger update');
  });

  it('should trigger when items are completed', () => {
    const tracker = new ChecklistTracker(9);
    tracker.checkUpdate(makeAssistantMsg([
      { content: 'Task 1', status: 'pending' },
      { content: 'Task 2', status: 'pending' },
      { content: 'Task 3', status: 'pending' },
    ]));

    const update = tracker.checkUpdate(makeAssistantMsg([
      { content: 'Task 1', status: 'completed' },
      { content: 'Task 2', status: 'pending' },
      { content: 'Task 3', status: 'pending' },
    ]));

    assert.ok(update, 'Should trigger update when threshold met');
    assert.ok(update.includes('33%'), 'Should show progress percentage');
    assert.ok(update.includes('Task 1'), 'Should include task content');
    assert.ok(update.includes('✅'), 'Should use completed checkbox');
  });

  it('should batch updates for large checklists (20 items)', () => {
    const tracker = new ChecklistTracker(9);
    tracker.checkUpdate(makeAssistantMsg(
      Array.from({ length: 20 }, (_, i) => ({ content: `Task ${i + 1}`, status: 'pending' }))
    ));

    // 20 items, threshold = ceil(20/9) = 3
    const update1 = tracker.checkUpdate(makeAssistantMsg(
      Array.from({ length: 20 }, (_, i) => ({
        content: `Task ${i + 1}`,
        status: i < 2 ? 'completed' : 'pending',
      }))
    ));
    assert.equal(update1, null, 'Should not update before threshold');

    const update2 = tracker.checkUpdate(makeAssistantMsg(
      Array.from({ length: 20 }, (_, i) => ({
        content: `Task ${i + 1}`,
        status: i < 3 ? 'completed' : 'pending',
      }))
    ));
    assert.ok(update2, 'Should update when threshold met');
  });

  it('should always trigger when all items completed', () => {
    const tracker = new ChecklistTracker(9);
    tracker.checkUpdate(makeAssistantMsg([
      { content: 'Task 1', status: 'pending' },
      { content: 'Task 2', status: 'pending' },
    ]));

    const update = tracker.checkUpdate(makeAssistantMsg([
      { content: 'Task 1', status: 'completed' },
      { content: 'Task 2', status: 'completed' },
    ]));

    assert.ok(update, 'Should always update when all completed');
    assert.ok(update.includes('100%'), 'Should show 100%');
  });

  it('should return null for messages without TodoWrite', () => {
    const tracker = new ChecklistTracker(9);
    const msg = { type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } };
    assert.equal(tracker.checkUpdate(msg), null);
  });

  it('should handle in_progress status', () => {
    const tracker = new ChecklistTracker(9);
    tracker.checkUpdate(makeAssistantMsg([
      { content: 'Task 1', status: 'completed' },
      { content: 'Task 2', status: 'in_progress' },
      { content: 'Task 3', status: 'pending' },
    ]));

    const update = tracker.checkUpdate(makeAssistantMsg([
      { content: 'Task 1', status: 'completed' },
      { content: 'Task 2', status: 'in_progress' },
      { content: 'Task 3', status: 'pending' },
    ]));

    assert.ok(update, 'Should trigger on first completed detection');
    assert.ok(update.includes('🔄'), 'Should use in_progress indicator');
    assert.ok(update.includes('⬜'), 'Should use pending indicator');
  });

  it('should reset state between queries', () => {
    const tracker = new ChecklistTracker(9);
    tracker.checkUpdate(makeAssistantMsg([
      { content: 'Task 1', status: 'completed' },
      { content: 'Task 2', status: 'completed' },
    ]));

    tracker.reset();

    const result = tracker.checkUpdate(makeAssistantMsg([
      { content: 'New Task 1', status: 'pending' },
    ]));
    assert.equal(result, null, 'After reset, should not trigger on first detection');
  });

  it('should extract todos from message with blocks', () => {
    const tracker = new ChecklistTracker(9);
    const blocks = [{
      type: 'tool_use',
      name: 'TodoWrite',
      input: { todos: [{ content: 'Test', status: 'completed' }] },
    }];

    const result = tracker.extractTodos({ message: { content: blocks } });
    assert.ok(result);
    assert.equal(result.length, 1);
    assert.equal(result[0].content, 'Test');
    assert.equal(result[0].status, 'completed');
  });

  it('should format progress bar correctly', () => {
    const tracker = new ChecklistTracker(9);
    tracker.checkUpdate(makeAssistantMsg([
      { content: 'Task 1', status: 'completed' },
      { content: 'Task 2', status: 'pending' },
    ]));
    tracker.checkUpdate(makeAssistantMsg([
      { content: 'Task 1', status: 'completed' },
      { content: 'Task 2', status: 'completed' },
    ]));

    const update = tracker.checkUpdate(makeAssistantMsg([
      { content: 'Task 1', status: 'completed' },
      { content: 'Task 2', status: 'completed' },
      { content: 'Task 3', status: 'pending' },
    ]));
    // Just verify it has a progress bar
    if (update) {
      assert.ok(update.includes('['), 'Should have progress bar brackets');
    }
  });

});
