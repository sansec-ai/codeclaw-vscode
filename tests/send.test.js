'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Setup mocks BEFORE loading source modules
require('./helpers/setup');

const { createSender } = require('../out/wechat/send');
const { MessageType, MessageState, MessageItemType } = require('../out/wechat/types');

describe('wechat/send', () => {
  function createMockApi() {
    const sentMessages = [];
    return {
      sentMessages,
      api: {
        sendMessage: async (req) => {
          sentMessages.push(req);
        },
      },
    };
  }

  it('sends a text message with correct format', async () => {
    const { sentMessages, api } = createMockApi();
    const botId = 'bot_abc123';
    const sender = createSender(api, botId);

    await sender.sendText('user_xyz', 'ctx_token_123', 'Hello!');

    assert.equal(sentMessages.length, 1);
    const { msg } = sentMessages[0];
    assert.equal(msg.from_user_id, botId);
    assert.equal(msg.to_user_id, 'user_xyz');
    assert.equal(msg.context_token, 'ctx_token_123');
    assert.equal(msg.message_type, MessageType.BOT);
    assert.equal(msg.message_state, MessageState.FINISH);
  });

  it('includes text_item in item_list', async () => {
    const { sentMessages, api } = createMockApi();
    const sender = createSender(api, 'bot1');

    await sender.sendText('user1', 'ctx1', 'test content');

    const { msg } = sentMessages[0];
    assert.ok(Array.isArray(msg.item_list));
    assert.equal(msg.item_list.length, 1);
    assert.equal(msg.item_list[0].type, MessageItemType.TEXT);
    assert.equal(msg.item_list[0].text_item.text, 'test content');
  });

  it('generates client_id with wcc- prefix', async () => {
    const { sentMessages, api } = createMockApi();
    const sender = createSender(api, 'bot1');

    await sender.sendText('user1', 'ctx1', 'hi');

    const { msg } = sentMessages[0];
    assert.ok(msg.client_id.startsWith('wcc-'), `Expected wcc- prefix, got: ${msg.client_id}`);
  });

  it('generates unique client_ids for each message', async () => {
    const { sentMessages, api } = createMockApi();
    const sender = createSender(api, 'bot1');

    await sender.sendText('user1', 'ctx1', 'first');
    await sender.sendText('user1', 'ctx1', 'second');

    const id1 = sentMessages[0].msg.client_id;
    const id2 = sentMessages[1].msg.client_id;
    assert.notEqual(id1, id2);
    assert.ok(id1.startsWith('wcc-'));
    assert.ok(id2.startsWith('wcc-'));
  });

  it('sends long text (>2048 chars) without splitting', async () => {
    const { sentMessages, api } = createMockApi();
    const sender = createSender(api, 'bot1');

    const longText = 'A'.repeat(3000);
    await sender.sendText('user1', 'ctx1', longText);

    // Should send exactly 1 message (no splitting)
    assert.equal(sentMessages.length, 1, 'Long text should not be split');
    const { msg } = sentMessages[0];
    assert.equal(msg.item_list[0].text_item.text, longText);
    assert.equal(msg.item_list[0].text_item.text.length, 3000);
  });

  it('sends empty text correctly', async () => {
    const { sentMessages, api } = createMockApi();
    const sender = createSender(api, 'bot1');

    await sender.sendText('user1', 'ctx1', '');

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].msg.item_list[0].text_item.text, '');
  });
});
