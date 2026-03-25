'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Setup mocks BEFORE loading source modules
require('./helpers/setup');

const { extractText, extractFirstImageUrl } = require('../out/wechat/media');
const { MessageItemType } = require('../out/wechat/types');

describe('wechat/media', () => {
  describe('extractText', () => {
    it('returns text from text_item', () => {
      const item = {
        type: MessageItemType.TEXT,
        text_item: { text: 'hello world' },
      };
      assert.equal(extractText(item), 'hello world');
    });

    it('returns empty string when no text_item', () => {
      const item = {
        type: MessageItemType.IMAGE,
        image_item: {},
      };
      assert.equal(extractText(item), '');
    });

    it('returns empty string for empty text', () => {
      const item = {
        type: MessageItemType.TEXT,
        text_item: { text: '' },
      };
      assert.equal(extractText(item), '');
    });
  });

  describe('extractFirstImageUrl', () => {
    it('returns first image item', () => {
      const items = [
        { type: MessageItemType.TEXT, text_item: { text: 'hi' } },
        { type: MessageItemType.IMAGE, image_item: { url: 'http://img.jpg' } },
        { type: MessageItemType.IMAGE, image_item: { url: 'http://img2.jpg' } },
      ];
      const result = extractFirstImageUrl(items);
      assert.ok(result);
      assert.equal(result.type, MessageItemType.IMAGE);
    });

    it('returns undefined when no image items', () => {
      const items = [
        { type: MessageItemType.TEXT, text_item: { text: 'hi' } },
      ];
      const result = extractFirstImageUrl(items);
      assert.equal(result, undefined);
    });

    it('returns undefined for empty array', () => {
      const result = extractFirstImageUrl([]);
      assert.equal(result, undefined);
    });

    it('returns undefined for undefined input', () => {
      const result = extractFirstImageUrl(undefined);
      assert.equal(result, undefined);
    });
  });
});
