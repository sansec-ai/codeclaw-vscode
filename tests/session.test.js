'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Setup mocks BEFORE loading source modules
require('./helpers/setup');

// Set DATA_DIR to a temp dir so session store writes there
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcc-session-'));
process.env.WCC_DATA_DIR = tmpDir;

const { createSessionStore } = require('../out/session');

describe('session', () => {
  const store = createSessionStore();

  afterEach(() => {
    // Clean up session files
    const sessionsDir = path.join(tmpDir, 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir);
      for (const f of files) {
        fs.unlinkSync(path.join(sessionsDir, f));
      }
    }
  });

  describe('load', () => {
    it('returns default values for non-existent file', () => {
      const session = store.load('nonexistent_user');
      assert.equal(session.state, 'idle');
      assert.ok(Array.isArray(session.chatHistory));
      assert.equal(session.chatHistory.length, 0);
      assert.equal(session.maxHistoryLength, 100);
      assert.ok(typeof session.workingDirectory === 'string');
    });
  });

  describe('save + load', () => {
    it('persists and restores session data', () => {
      const session = store.load('user1');
      session.model = 'claude-3-opus';
      session.permissionMode = 'plan';
      session.chatHistory.push({ role: 'user', content: 'hello', timestamp: Date.now() });
      store.save('user1', session);

      const loaded = store.load('user1');
      assert.equal(loaded.model, 'claude-3-opus');
      assert.equal(loaded.permissionMode, 'plan');
      assert.equal(loaded.chatHistory.length, 1);
      assert.equal(loaded.chatHistory[0].content, 'hello');
    });
  });

  describe('clear', () => {
    it('clears chat history but preserves workingDirectory, model, permissionMode', () => {
      const session = store.load('user2');
      session.workingDirectory = '/project/dir';
      session.model = 'gpt-4';
      session.permissionMode = 'bypassPermissions';
      session.chatHistory.push({ role: 'user', content: 'keep?', timestamp: 1 });
      session.sdkSessionId = 'abc123';
      session.continuedSession = true;

      const cleared = store.clear('user2', session);

      assert.equal(cleared.state, 'idle');
      assert.equal(cleared.chatHistory.length, 0);
      assert.equal(cleared.workingDirectory, '/project/dir');
      assert.equal(cleared.model, 'gpt-4');
      assert.equal(cleared.permissionMode, 'bypassPermissions');
      assert.equal(cleared.continuedSession, false);
      assert.equal(cleared.sdkSessionId, undefined);
    });
  });

  describe('addChatMessage', () => {
    it('adds messages to chat history', () => {
      const session = store.load('user3');
      store.addChatMessage(session, 'user', 'hi');
      store.addChatMessage(session, 'assistant', 'hello!');
      assert.equal(session.chatHistory.length, 2);
      assert.equal(session.chatHistory[0].role, 'user');
      assert.equal(session.chatHistory[1].role, 'assistant');
    });

    it('trims history when exceeding maxHistoryLength', () => {
      const session = store.load('user4');
      session.maxHistoryLength = 5;
      for (let i = 0; i < 10; i++) {
        store.addChatMessage(session, 'user', `msg-${i}`);
      }
      assert.equal(session.chatHistory.length, 5);
      // Should keep the last 5
      assert.equal(session.chatHistory[0].content, 'msg-5');
      assert.equal(session.chatHistory[4].content, 'msg-9');
    });
  });

  describe('getChatHistoryText', () => {
    it('returns default text when no history', () => {
      const session = store.load('user5');
      const text = store.getChatHistoryText(session);
      assert.equal(text, '暂无对话记录');
    });

    it('formats messages with timestamps and roles', () => {
      const session = store.load('user6');
      store.addChatMessage(session, 'user', '你好');
      store.addChatMessage(session, 'assistant', '你好！有什么可以帮助你的？');
      const text = store.getChatHistoryText(session);
      assert.ok(text.includes('用户'));
      assert.ok(text.includes('Claude'));
      assert.ok(text.includes('你好'));
    });

    it('respects limit parameter', () => {
      const session = store.load('user7');
      for (let i = 0; i < 5; i++) {
        store.addChatMessage(session, 'user', `msg-${i}`);
      }
      const text = store.getChatHistoryText(session, 2);
      // Should only include last 2 messages
      assert.ok(text.includes('msg-3'));
      assert.ok(text.includes('msg-4'));
      assert.ok(!text.includes('msg-0'));
      assert.ok(!text.includes('msg-1'));
      assert.ok(!text.includes('msg-2'));
    });
  });
});
