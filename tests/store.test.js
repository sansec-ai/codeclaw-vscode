'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// store.js has no external deps beyond node:fs
const { loadJson, saveJson } = require('../out/store');

describe('store', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcc-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadJson', () => {
    it('returns fallback when file does not exist', () => {
      const fp = path.join(tmpDir, 'nope.json');
      const result = loadJson(fp, { key: 'default' });
      assert.deepStrictEqual(result, { key: 'default' });
    });

    it('returns parsed JSON when file exists', () => {
      const fp = path.join(tmpDir, 'data.json');
      const data = { name: 'test', count: 42 };
      fs.writeFileSync(fp, JSON.stringify(data), 'utf-8');
      const result = loadJson(fp, {});
      assert.deepStrictEqual(result, data);
    });

    it('returns fallback when JSON is malformed', () => {
      const fp = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(fp, 'not valid json {{{', 'utf-8');
      const result = loadJson(fp, { fallback: true });
      assert.deepStrictEqual(result, { fallback: true });
    });

    it('returns fallback when file has no read permission', () => {
      const fp = path.join(tmpDir, 'noperm.json');
      fs.writeFileSync(fp, '{}', 'utf-8');
      fs.chmodSync(fp, 0o000);
      // Some systems allow root to read anyway; skip if root
      if (process.getuid && process.getuid() === 0) {
        fs.chmodSync(fp, 0o644);
        // Just test that it returns something
        const result = loadJson(fp, { fallback: true });
        assert.ok(result);
      } else {
        const result = loadJson(fp, { fallback: true });
        assert.deepStrictEqual(result, { fallback: true });
      }
    });
  });

  describe('saveJson', () => {
    it('writes pretty-printed JSON', () => {
      const fp = path.join(tmpDir, 'out.json');
      const data = { a: 1, b: 'hello' };
      saveJson(fp, data);
      const raw = fs.readFileSync(fp, 'utf-8');
      const parsed = JSON.parse(raw);
      assert.deepStrictEqual(parsed, data);
      // Should be pretty-printed (contains newlines)
      assert.ok(raw.includes('\n'));
    });

    it('round-trips save → load', () => {
      const fp = path.join(tmpDir, 'roundtrip.json');
      const data = { items: [1, 2, 3], nested: { x: true } };
      saveJson(fp, data);
      const loaded = loadJson(fp, null);
      assert.deepStrictEqual(loaded, data);
    });

    it('creates parent directories if needed', () => {
      const fp = path.join(tmpDir, 'sub', 'dir', 'deep.json');
      saveJson(fp, { ok: true });
      assert.ok(fs.existsSync(fp));
      const loaded = loadJson(fp, {});
      assert.deepStrictEqual(loaded, { ok: true });
    });
  });
});
