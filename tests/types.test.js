'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Test: src/wechat/types.ts (enums) ──────────────────────────────────────

// types.js has zero external dependencies, safe to require directly
const { MessageType, MessageItemType, MessageState } = require('../out/wechat/types');

describe('wechat/types', () => {
  describe('MessageType', () => {
    it('USER = 1', () => {
      assert.equal(MessageType.USER, 1);
    });
    it('BOT = 2', () => {
      assert.equal(MessageType.BOT, 2);
    });
  });

  describe('MessageItemType', () => {
    it('TEXT = 1', () => {
      assert.equal(MessageItemType.TEXT, 1);
    });
    it('IMAGE = 2', () => {
      assert.equal(MessageItemType.IMAGE, 2);
    });
    it('VOICE = 3', () => {
      assert.equal(MessageItemType.VOICE, 3);
    });
    it('FILE = 4', () => {
      assert.equal(MessageItemType.FILE, 4);
    });
    it('VIDEO = 5', () => {
      assert.equal(MessageItemType.VIDEO, 5);
    });
  });

  describe('MessageState', () => {
    it('NEW = 0', () => {
      assert.equal(MessageState.NEW, 0);
    });
    it('GENERATING = 1', () => {
      assert.equal(MessageState.GENERATING, 1);
    });
    it('FINISH = 2', () => {
      assert.equal(MessageState.FINISH, 2);
    });
  });
});
