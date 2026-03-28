#!/usr/bin/env node
'use strict';

/**
 * Local Telegram Bot API Mock Server
 * 
 * Simulates the real Telegram Bot API for testing the Telegram channel
 * without any network access. Supports all features the adapter uses:
 * 
 *   - getMe           → bot identity
 *   - getUpdates      → long-poll message receiving
 *   - sendMessage     → sending text replies
 *   - getFile         → file metadata lookup
 *   - downloadFile    → file binary download (images)
 * 
 * Usage (standalone):
 *   node tests/mock-telegram-server.js [--port 9911] [--token test-token]
 * 
 * Usage (as module in tests):
 *   const { createMockServer, ... } = require('./mock-telegram-server');
 *   const mock = createMockServer({ port: 9912, token: 'my-token' });
 *   await mock.start();
 *   // ... use mock.simulateUserText() etc.
 *   await mock.stop();
 */

const http = require('node:http');

// ── Default Bot / User ───────────────────────────────────────────────────

const DEFAULT_BOT = {
  id: 987654321,
  is_bot: true,
  first_name: 'CodeClawTest',
  username: 'codeclaw_test_bot',
};

const DEFAULT_USER = {
  id: 111222333,
  is_bot: false,
  first_name: 'Test',
  last_name: 'User',
  username: 'testuser',
  language_code: 'zh',
};

// ── Factory ──────────────────────────────────────────────────────────────

function createMockServer(options) {
  options = options || {};
  const TOKEN = options.token || 'test-bot-token';
  const BOT = options.bot || DEFAULT_BOT;
  const USER = options.user || DEFAULT_USER;

  let updateIdCounter = 1000;
  const pendingUpdates = [];
  const sentMessages = [];
  const updateWaiters = [];
  let server = null;

  // ── Fake file storage ─────────────────────────────────────────────

  const FAKE_IMAGE = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  const fakeFiles = {
    'photo_001': {
      file_id: 'AgACAgIAAxkBAAI',
      file_unique_id: 'AQAD',
      file_size: FAKE_IMAGE.length,
      width: 800,
      height: 600,
      _buffer: FAKE_IMAGE,
    },
  };

  // ── Public methods ────────────────────────────────────────────────

  function simulateUserText(text, chatId) {
    chatId = chatId ?? USER.id;
    const update = {
      update_id: ++updateIdCounter,
      message: {
        message_id: updateIdCounter,
        from: { ...USER, id: chatId },
        chat: { id: chatId, type: 'private', first_name: USER.first_name, last_name: USER.last_name },
        date: Math.floor(Date.now() / 1000),
        text,
      },
    };
    queueUpdate(update);
    return update.update_id;
  }

  function simulateUserPhoto(fileId, caption) {
    fileId = fileId ?? 'photo_001';
    const photoSize = fakeFiles[fileId] ? {
      file_id: fileId,
      file_unique_id: 'AQAD' + fileId,
      file_size: fakeFiles[fileId].file_size,
      width: fakeFiles[fileId].width,
      height: fakeFiles[fileId].height,
    } : {
      file_id: fileId,
      file_unique_id: 'AQAD_unknown',
      file_size: 0,
      width: 100,
      height: 100,
    };

    const update = {
      update_id: ++updateIdCounter,
      message: {
        message_id: updateIdCounter,
        from: { ...USER },
        chat: { id: USER.id, type: 'private', first_name: USER.first_name, last_name: USER.last_name },
        date: Math.floor(Date.now() / 1000),
        photo: [photoSize],
        caption: caption ?? '',
      },
    };
    queueUpdate(update);
    return update.update_id;
  }

  function simulateGroupMessage(text) {
    const update = {
      update_id: ++updateIdCounter,
      message: {
        message_id: updateIdCounter,
        from: { ...USER },
        chat: { id: -1001234567890, type: 'group', title: 'Test Group' },
        date: Math.floor(Date.now() / 1000),
        text,
      },
    };
    queueUpdate(update);
    return update.update_id;
  }

  function simulateBotMessage(text) {
    const update = {
      update_id: ++updateIdCounter,
      message: {
        message_id: updateIdCounter,
        from: { id: 999888777, is_bot: true, first_name: 'SomeBot', username: 'some_bot' },
        chat: { id: USER.id, type: 'private', first_name: USER.first_name },
        date: Math.floor(Date.now() / 1000),
        text,
      },
    };
    queueUpdate(update);
    return update.update_id;
  }

  function simulateCallbackQuery(data) {
    const update = {
      update_id: ++updateIdCounter,
      callback_query: {
        id: 'cb_' + updateIdCounter,
        from: { ...USER },
        data: data ?? 'test_data',
      },
    };
    queueUpdate(update);
    return update.update_id;
  }

  function getSentMessages() {
    return [...sentMessages];
  }

  function clearSentMessages() {
    sentMessages.length = 0;
  }

  function waitForSentMessages(count, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (sentMessages.length >= count) { resolve(getSentMessages()); return; }
      const start = Date.now();
      const interval = setInterval(() => {
        if (sentMessages.length >= count) {
          clearInterval(interval);
          resolve(getSentMessages());
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error(`Timeout: waited ${timeoutMs}ms for ${count} sent messages, got ${sentMessages.length}`));
        }
      }, 50);
    });
  }

  // ── Internal ───────────────────────────────────────────────────────

  function queueUpdate(update) {
    if (updateWaiters.length > 0) {
      const waiter = updateWaiters.shift();
      waiter([update]);
    } else {
      pendingUpdates.push(update);
    }
  }

  function extractToken(pathname) {
    const match = pathname.match(/\/bot([^/]+)\//);
    return match ? match[1] : null;
  }

  function parseJsonBody(body) {
    if (!body || body.length === 0) return {};
    return JSON.parse(body);
  }

  function jsonResponse(res, data, statusCode) {
    statusCode = statusCode ?? 200;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  function jsonError(res, errorCode, description) {
    jsonResponse(res, { ok: false, error_code: errorCode, description }, 200);
  }

  // ── HTTP handler ──────────────────────────────────────────────────

  function handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${options.port}`);
    const token = extractToken(url.pathname);
    if (!token) { jsonError(res, 404, 'Not Found'); return; }
    if (token !== TOKEN) { jsonError(res, 401, 'Unauthorized'); return; }

    const method = url.pathname.replace(/\/bot[^/]+\//, '');

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      const params = parseJsonBody(body);
      for (const [key, value] of url.searchParams) { params[key] = value; }

      try {
        handleMethod(method, params, req, res);
      } catch (err) {
        jsonError(res, 500, err instanceof Error ? err.message : String(err));
      }
    });
  }

  function handleMethod(method, params, req, res) {
    switch (method) {

      case 'getMe':
        console.log('  [MockAPI] getMe');
        jsonResponse(res, { ok: true, result: BOT });
        break;

      case 'getUpdates': {
        const offset = params.offset ? parseInt(params.offset, 10) : 0;
        const timeout = params.timeout ? parseInt(params.timeout, 10) : 30;
        const available = offset > 0
          ? pendingUpdates.filter(u => u.update_id >= offset)
          : [...pendingUpdates];

        if (available.length > 0) {
          const returned = available.splice(0);
          const idx = pendingUpdates.findIndex(u => u.update_id >= offset);
          if (idx >= 0) pendingUpdates.splice(idx);
          console.log(`  [MockAPI] getUpdates → ${returned.length} update(s)`);
          jsonResponse(res, { ok: true, result: returned });
        } else {
          console.log(`  [MockAPI] getUpdates → waiting (timeout=${timeout}s)`);
          const timer = setTimeout(() => {
            const idx = updateWaiters.indexOf(waiter);
            if (idx >= 0) updateWaiters.splice(idx, 1);
            console.log('  [MockAPI] getUpdates → timeout');
            jsonResponse(res, { ok: true, result: [] });
          }, Math.min(timeout, 5) * 1000);

          const waiter = (updates) => {
            clearTimeout(timer);
            console.log(`  [MockAPI] getUpdates → ${updates.length} update(s)`);
            jsonResponse(res, { ok: true, result: updates });
          };
          updateWaiters.push(waiter);

          req.on('close', () => {
            clearTimeout(timer);
            const idx = updateWaiters.indexOf(waiter);
            if (idx >= 0) updateWaiters.splice(idx, 1);
          });
        }
        break;
      }

      case 'sendMessage': {
        const chatId = params.chat_id;
        const text = params.text;
        const message = {
          message_id: ++updateIdCounter,
          from: { ...BOT },
          chat: { id: Number(chatId), type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text,
        };
        sentMessages.push({ chatId: Number(chatId), text });
        console.log(`  [MockAPI] sendMessage → chat=${chatId}, text="${String(text).substring(0, 60)}${String(text).length > 60 ? '...' : ''}"`);
        jsonResponse(res, { ok: true, result: message });
        break;
      }

      case 'getFile': {
        const fileId = params.file_id;
        const fake = fakeFiles[fileId];
        if (fake) {
          console.log(`  [MockAPI] getFile → ${fileId}`);
          jsonResponse(res, { ok: true, result: {
            file_id: fake.file_id,
            file_unique_id: fake.file_unique_id,
            file_size: fake.file_size,
            file_path: `photos/file_${fileId}.jpg`,
          }});
        } else {
          jsonError(res, 400, 'Bad Request: file not found');
        }
        break;
      }

      default:
        if (method.startsWith('photos/file_') || method.startsWith('documents/')) {
          for (const [id, fake] of Object.entries(fakeFiles)) {
            if (method.includes(id) && fake._buffer) {
              console.log(`  [MockAPI] downloadFile → ${method} (${fake._buffer.length} bytes)`);
              res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': fake._buffer.length });
              res.end(fake._buffer);
              return;
            }
          }
          jsonError(res, 404, 'Not Found');
          return;
        }
        jsonError(res, 404, `Unknown method: ${method}`);
        break;
    }
  }

  // ── Start / Stop ──────────────────────────────────────────────────

  function start() {
    return new Promise((resolve, reject) => {
      if (server) { resolve(); return; }
      server = http.createServer(handleRequest);
      server.on('error', reject);
      server.listen(options.port || 0, () => {
        const port = server.address().port;
        options.port = port;
        console.log(`  [MockServer] Telegram mock listening on port ${port} (token: ${TOKEN}, bot: @${BOT.username})`);
        resolve();
      });
    });
  }

  function stop() {
    return new Promise((resolve) => {
      // Clear all pending waiters
      for (const waiter of updateWaiters) {
        waiter([]);
      }
      updateWaiters.length = 0;
      pendingUpdates.length = 0;

      if (!server) { resolve(); return; }
      server.close(() => { server = null; resolve(); });
    });
  }

  return {
    start,
    stop,
    simulateUserText,
    simulateUserPhoto,
    simulateGroupMessage,
    simulateBotMessage,
    simulateCallbackQuery,
    getSentMessages,
    clearSentMessages,
    waitForSentMessages,
    BOT,
    USER,
    PORT: options.port || 9911,
    TOKEN: TOKEN,
  };
}

// ── Standalone mode ─────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let port = 9911;
  let token = 'test-bot-token';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) { port = parseInt(args[i + 1], 10); i++; }
    if (args[i] === '--token' && args[i + 1]) { token = args[i + 1]; i++; }
  }

  const mock = createMockServer({ port, token });
  mock.start().then(() => {
    console.log('');
    console.log(`╔══════════════════════════════════════════════════════════╗`);
    console.log(`║   Mock Telegram Bot API Server                          ║`);
    console.log(`║                                                          ║`);
    console.log(`║   URL:    http://localhost:${String(port).padEnd(34)}║`);
    console.log(`║   Token:  ${token.padEnd(44)}║`);
    console.log(`║   Bot:    @${mock.BOT.username.padEnd(44)}║`);
    console.log(`║                                                          ║`);
    console.log(`║   Supported: getMe / getUpdates / sendMessage           ║`);
    console.log(`║              getFile / downloadFile                      ║`);
    console.log(`╚══════════════════════════════════════════════════════════╝`);
    console.log('');
  });
}

module.exports = { createMockServer };
