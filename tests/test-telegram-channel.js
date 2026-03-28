#!/usr/bin/env node
'use strict';

/**
 * Telegram Channel Integration Test
 * 
 * Starts a local mock Telegram server, creates a TelegramChannel,
 * and exercises the full message lifecycle.
 * 
 * No network access required — everything runs against localhost.
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Setup vscode mock
require('./helpers/setup');

const { createMockServer } = require('./mock-telegram-server');
const { createTelegramChannel } = require('../out/channels/telegram-adapter');
const { TelegramApi, TelegramApiError } = require('../out/channels/telegram-api');

// ── Test fixtures ────────────────────────────────────────────────────────

const TEST_PORT = 19911; // high port to avoid conflicts
const TEST_TOKEN = 'integration-test-token';

let mock;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Telegram Channel Integration (Mock Server)', () => {

  before(async () => {
    mock = createMockServer({ port: TEST_PORT, token: TEST_TOKEN });
    await mock.start();
  });

  after(async () => {
    await mock.stop();
  });

  beforeEach(() => {
    mock.clearSentMessages();
  });

  // ── Bot verification ─────────────────────────────────────────────────

  describe('getMe (bot identity)', () => {
    it('returns correct bot info', async () => {
      const api = new TelegramApi(TEST_TOKEN, `http://localhost:${TEST_PORT}`);
      const bot = await api.getMe();
      assert.equal(bot.id, mock.BOT.id);
      assert.equal(bot.username, mock.BOT.username);
      assert.equal(bot.is_bot, true);
    });

    it('rejects invalid token with 401', async () => {
      const api = new TelegramApi('wrong-token', `http://localhost:${TEST_PORT}`);
      try {
        await api.getMe();
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err instanceof TelegramApiError);
        assert.equal(err.errorCode, 401);
      }
    });
  });

  // ── Text message receiving ───────────────────────────────────────────

  describe('Receiving text messages', () => {
    let received;
    let channel;

    beforeEach(() => {
      received = [];
      channel = createTelegramChannel(TEST_TOKEN, { baseUrl: `http://localhost:${TEST_PORT}`, pollTimeout: 1 });
      channel.start({
        onMessage: async (msg) => { received.push(msg); },
        onSessionExpired: () => {},
      });
    });

    afterEach(() => { channel.stop(); });

    it('receives a simple text message', async () => {
      mock.simulateUserText('Hello Claude!');
      await sleep(500);

      assert.equal(received.length, 1);
      assert.equal(received[0].text, 'Hello Claude!');
      assert.equal(received[0].fromUserId, String(mock.USER.id));
      assert.ok(received[0].id);
      assert.ok(received[0].contextToken);
    });

    it('receives multiple messages in order', async () => {
      mock.simulateUserText('First');
      mock.simulateUserText('Second');
      mock.simulateUserText('Third');
      await sleep(1000);

      assert.equal(received.length, 3);
      assert.equal(received[0].text, 'First');
      assert.equal(received[1].text, 'Second');
      assert.equal(received[2].text, 'Third');
    });

    it('receives slash commands', async () => {
      mock.simulateUserText('/help');
      await sleep(500);

      assert.equal(received.length, 1);
      assert.equal(received[0].text, '/help');
    });

    it('receives empty text', async () => {
      mock.simulateUserText('');
      await sleep(500);

      assert.equal(received.length, 1);
      assert.equal(received[0].text, '');
    });

    it('receives long text (5000 chars)', async () => {
      mock.simulateUserText('A'.repeat(5000));
      await sleep(500);

      assert.equal(received.length, 1);
      assert.equal(received[0].text.length, 5000);
    });

    it('receives Chinese text', async () => {
      const text = '你好，Claude！请帮我写一个排序算法。';
      mock.simulateUserText(text);
      await sleep(500);

      assert.equal(received.length, 1);
      assert.equal(received[0].text, text);
    });

    it('receives multi-line text', async () => {
      const text = 'Line 1\nLine 2\nLine 3';
      mock.simulateUserText(text);
      await sleep(500);

      assert.equal(received.length, 1);
      assert.equal(received[0].text, text);
    });
  });

  // ── Message filtering ────────────────────────────────────────────────

  describe('Message filtering', () => {
    let received;
    let channel;

    beforeEach(() => {
      received = [];
      channel = createTelegramChannel(TEST_TOKEN, { baseUrl: `http://localhost:${TEST_PORT}`, pollTimeout: 1 });
      channel.start({
        onMessage: async (msg) => { received.push(msg); },
        onSessionExpired: () => {},
      });
    });

    afterEach(() => { channel.stop(); });

    it('ignores group messages', async () => {
      mock.simulateGroupMessage('Hello from group');
      await sleep(500);

      assert.equal(received.length, 0);
    });

    it('ignores bot messages', async () => {
      mock.simulateBotMessage('Hello from bot');
      await sleep(500);

      assert.equal(received.length, 0);
    });

    it('ignores callback queries (no message field)', async () => {
      mock.simulateCallbackQuery('btn_click');
      await sleep(500);

      assert.equal(received.length, 0);
    });
  });

  // ── allowedChatIds ───────────────────────────────────────────────────

  describe('allowedChatIds filtering', () => {
    let received;
    let channel;

    beforeEach(() => {
      received = [];
      channel = createTelegramChannel(TEST_TOKEN, {
        baseUrl: `http://localhost:${TEST_PORT}`,
        pollTimeout: 1,
        allowedChatIds: [mock.USER.id],
      });
      channel.start({
        onMessage: async (msg) => { received.push(msg); },
        onSessionExpired: () => {},
      });
    });

    afterEach(() => { channel.stop(); });

    it('accepts messages from allowed chat', async () => {
      mock.simulateUserText('Hello', mock.USER.id);
      await sleep(500);

      assert.equal(received.length, 1);
    });

    it('rejects messages from non-allowed chat', async () => {
      mock.simulateUserText('Hello', 999888777);
      await sleep(500);

      assert.equal(received.length, 0);
    });
  });

  // ── Sending replies ──────────────────────────────────────────────────

  describe('Sending replies (sendMessage)', () => {
    let channel;

    beforeEach(() => {
      channel = createTelegramChannel(TEST_TOKEN, { baseUrl: `http://localhost:${TEST_PORT}`, pollTimeout: 1 });
    });

    afterEach(() => { channel.stop(); });

    it('sends text to correct chat', async () => {
      const sender = channel.getSender();
      await sender.sendText(String(mock.USER.id), '1', 'Hello from Claude!');

      const sent = mock.getSentMessages();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].chatId, mock.USER.id);
      assert.equal(sent[0].text, 'Hello from Claude!');
    });

    it('sends multiple replies in order', async () => {
      const sender = channel.getSender();
      await sender.sendText('111', '1', 'First');
      await sender.sendText('111', '2', 'Second');
      await sender.sendText('111', '3', 'Third');

      const sent = mock.getSentMessages();
      assert.equal(sent.length, 3);
      assert.equal(sent[0].text, 'First');
      assert.equal(sent[2].text, 'Third');
    });

    it('sends long text without splitting', async () => {
      const sender = channel.getSender();
      await sender.sendText('111', '1', 'X'.repeat(5000));

      const sent = mock.getSentMessages();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].text.length, 5000);
    });

    it('sends empty text', async () => {
      const sender = channel.getSender();
      await sender.sendText('111', '1', '');

      const sent = mock.getSentMessages();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].text, '');
    });

    it('sends Chinese + emoji text', async () => {
      const sender = channel.getSender();
      const text = '这是 Claude 的回复，包含 emoji 🎉🚀';
      await sender.sendText('111', '1', text);

      const sent = mock.getSentMessages();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].text, text);
    });

    it('sends markdown truncation notice', async () => {
      const sender = channel.getSender();
      const text = '**由于Telegram消息限制，以下是部分内容，完整内容请到VSCode查看**\n\n截断内容...';
      await sender.sendText('111', '1', text);

      const sent = mock.getSentMessages();
      assert.equal(sent.length, 1);
      assert.ok(sent[0].text.includes('Telegram消息限制'));
    });
  });

  // ── Full round-trip ──────────────────────────────────────────────────

  describe('Full round-trip (receive → process → reply)', () => {
    it('echoes user message back', async () => {
      const channel = createTelegramChannel(TEST_TOKEN, { baseUrl: `http://localhost:${TEST_PORT}`, pollTimeout: 1 });

      channel.start({
        onMessage: async (msg) => {
          const sender = channel.getSender();
          await sender.sendText(msg.fromUserId, msg.contextToken, `收到: ${msg.text}`);
        },
        onSessionExpired: () => {},
      });

      mock.simulateUserText('你好 Claude');
      await mock.waitForSentMessages(1, 3000);

      const sent = mock.getSentMessages();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].text, '收到: 你好 Claude');
      assert.equal(sent[0].chatId, mock.USER.id);

      channel.stop();
    });

    it('handles /help command round-trip', async () => {
      const channel = createTelegramChannel(TEST_TOKEN, { baseUrl: `http://localhost:${TEST_PORT}`, pollTimeout: 1 });

      channel.start({
        onMessage: async (msg) => {
          if (msg.text === '/help') {
            const sender = channel.getSender();
            await sender.sendText(msg.fromUserId, msg.contextToken, '可用命令：\n/help\n/new\n/model');
          }
        },
        onSessionExpired: () => {},
      });

      mock.simulateUserText('/help');
      await mock.waitForSentMessages(1, 3000);

      const sent = mock.getSentMessages();
      assert.equal(sent.length, 1);
      assert.ok(sent[0].text.includes('/help'));
      assert.ok(sent[0].text.includes('/new'));

      channel.stop();
    });

    it('simulates message truncation flow', async () => {
      const channel = createTelegramChannel(TEST_TOKEN, { baseUrl: `http://localhost:${TEST_PORT}`, pollTimeout: 1 });

      channel.start({
        onMessage: async (msg) => {
          const sender = channel.getSender();
          const longResponse = '这是一段很长的回复。'.repeat(200);
          const MAX_LENGTH = 1500;
          let finalText = longResponse;
          if (finalText.length > MAX_LENGTH) {
            finalText = `**由于Telegram消息限制，以下是部分内容，完整内容请到VSCode查看**\n\n${finalText.slice(0, MAX_LENGTH)}`;
          }
          await sender.sendText(msg.fromUserId, msg.contextToken, finalText);
        },
        onSessionExpired: () => {},
      });

      mock.simulateUserText('explain something');
      await mock.waitForSentMessages(1, 3000);

      const sent = mock.getSentMessages();
      assert.equal(sent.length, 1);
      assert.ok(sent[0].text.includes('Telegram消息限制'));
      assert.ok(sent[0].text.length > 1500);
      assert.ok(sent[0].text.length < 1700);

      channel.stop();
    });
  });

  // ── File operations ──────────────────────────────────────────────────

  describe('File operations (getFile + downloadFile)', () => {
    it('gets file metadata', async () => {
      const api = new TelegramApi(TEST_TOKEN, `http://localhost:${TEST_PORT}`);
      const file = await api.getFile('photo_001');

      assert.ok(file.file_path);
      assert.ok(file.file_size > 0);
      assert.equal(file.file_id, 'AgACAgIAAxkBAAI');
    });

    it('downloads a file', async () => {
      const api = new TelegramApi(TEST_TOKEN, `http://localhost:${TEST_PORT}`);
      const file = await api.getFile('photo_001');
      const buffer = await api.downloadFile(file.file_path);

      assert.ok(buffer instanceof Buffer);
      assert.ok(buffer.length > 0);
    });

    it('returns error for non-existent file', async () => {
      const api = new TelegramApi(TEST_TOKEN, `http://localhost:${TEST_PORT}`);
      try {
        await api.getFile('nonexistent');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err instanceof TelegramApiError);
      }
    });
  });

  // ── Photo messages ───────────────────────────────────────────────────

  describe('Photo messages', () => {
    let received;
    let channel;

    beforeEach(() => {
      received = [];
      channel = createTelegramChannel(TEST_TOKEN, { baseUrl: `http://localhost:${TEST_PORT}`, pollTimeout: 1 });
      channel.start({
        onMessage: async (msg) => { received.push(msg); },
        onSessionExpired: () => {},
      });
    });

    afterEach(() => { channel.stop(); });

    it('receives photo with caption', async () => {
      mock.simulateUserPhoto('photo_001', 'Look at this');
      await sleep(500);

      assert.equal(received.length, 1);
      assert.equal(received[0].text, 'Look at this');
    });

    it('receives photo without caption', async () => {
      mock.simulateUserPhoto('photo_001');
      await sleep(500);

      assert.equal(received.length, 1);
      assert.equal(received[0].text, '');
    });
  });

  // ── Error handling ───────────────────────────────────────────────────

  describe('Error handling', () => {
    it('invalid token triggers onSessionExpired', async () => {
      const badChannel = createTelegramChannel('wrong-token', {
        baseUrl: `http://localhost:${TEST_PORT}`,
        pollTimeout: 1,
      });

      let expired = false;
      badChannel.start({
        onMessage: async () => {},
        onSessionExpired: () => { expired = true; },
      });

      await sleep(3000);

      assert.ok(expired, 'onSessionExpired should be called for 401');
      badChannel.stop();
    });
  });

  // ── Lifecycle ────────────────────────────────────────────────────────

  describe('Channel lifecycle', () => {
    it('start → stop → start processes messages across restarts', async () => {
      let count = 0;
      const channel = createTelegramChannel(TEST_TOKEN, { baseUrl: `http://localhost:${TEST_PORT}`, pollTimeout: 1 });

      channel.start({
        onMessage: async () => { count++; },
        onSessionExpired: () => {},
      });

      mock.simulateUserText('msg1');
      await sleep(500);

      channel.stop();
      await sleep(200);

      channel.start({
        onMessage: async () => { count++; },
        onSessionExpired: () => {},
      });

      mock.simulateUserText('msg2');
      await sleep(500);

      channel.stop();
      assert.equal(count, 2);
    });

    it('calling stop twice does not crash', () => {
      const channel = createTelegramChannel(TEST_TOKEN, { baseUrl: `http://localhost:${TEST_PORT}`, pollTimeout: 1 });
      assert.doesNotThrow(() => {
        channel.stop();
        channel.stop();
      });
    });
  });

  // ── Channel metadata ─────────────────────────────────────────────────

  describe('Channel metadata', () => {
    it('has correct channelType and displayName', () => {
      const channel = createTelegramChannel(TEST_TOKEN, { baseUrl: `http://localhost:${TEST_PORT}` });
      assert.equal(channel.channelType, 'telegram');
      assert.equal(channel.displayName, 'Telegram');
    });

    it('has accountId derived from token', () => {
      const channel = createTelegramChannel(TEST_TOKEN, { baseUrl: `http://localhost:${TEST_PORT}` });
      assert.ok(channel.accountId.startsWith('tg_integra'));
    });
  });
});
