#!/usr/bin/env node
'use strict';

/**
 * Mock WeChat ClawBot API Server
 *
 * Simulates the ilink WeChat Bot API for testing the WeChat channel
 * without any network access. Supports:
 *
 *   - POST ilink/bot/getupdates (long-poll message receiving)
 *   - POST ilink/bot/sendmessage (sending replies)
 *   - GET  ilink/bot/get_bot_qrcode (QR code generation)
 *   - GET  ilink/bot/get_qrcode_status (QR scan polling)
 *
 * Usage (standalone):
 *   node tests/mock-wechat-server.js [--port 9930] [--token test-wechat-token]
 *
 * Usage (module):
 *   const { createMockWeChatServer } = require('./mock-wechat-server');
 *   const mock = createMockWeChatServer({ port: 9930, token: 'test-token' });
 *   await mock.start();
 */

const http = require('node:http');

// ── Types matching wechat/types.ts ────────────────────────────────────────

const MessageType = { USER: 1, BOT: 2 };
const MessageItemType = { TEXT: 1, IMAGE: 2 };

// ── Factory ──────────────────────────────────────────────────────────────

function createMockWeChatServer(options) {
  options = options || {};
  const TOKEN = options.token || 'test-wechat-token';
  const PORT = options.port || 9930;

  const MOCK_BOT = {
    ilink_bot_id: 'mock_bot_id_001',
    ilink_user_id: 'mock_user_id_001',
  };

  let updateCounter = 0;
  const pendingMessages = [];
  const sentMessages = [];
  const updateWaiters = [];
  let server = null;

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Simulate a user sending a text message.
   */
  function simulateUserText(text, fromUserId) {
    fromUserId = fromUserId || MOCK_BOT.ilink_user_id;
    updateCounter++;
    const msg = {
      seq: updateCounter,
      message_id: updateCounter,
      from_user_id: fromUserId,
      to_user_id: MOCK_BOT.ilink_bot_id,
      create_time_ms: Date.now(),
      message_type: MessageType.USER,
      message_state: 0,
      context_token: 'ctx_' + updateCounter,
      item_list: [{
        type: MessageItemType.TEXT,
        text_item: { text },
      }],
    };
    pendingMessages.push(msg);
    return msg;
  }

  /**
   * Simulate a user sending a bot message (should be ignored).
   */
  function simulateBotMessage(text) {
    updateCounter++;
    const msg = {
      seq: updateCounter,
      message_id: updateCounter,
      from_user_id: MOCK_BOT.ilink_bot_id,
      to_user_id: MOCK_BOT.ilink_user_id,
      create_time_ms: Date.now(),
      message_type: MessageType.BOT,
      context_token: 'ctx_' + updateCounter,
      item_list: [{
        type: MessageItemType.TEXT,
        text_item: { text },
      }],
    };
    pendingMessages.push(msg);
    return msg;
  }

  function getSentMessages() { return [...sentMessages]; }
  function clearSentMessages() { sentMessages.length = 0; }

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
          reject(new Error(`Timeout: waited ${timeoutMs}ms for ${count} messages, got ${sentMessages.length}`));
        }
      }, 50);
    });
  }

  /**
   * Simulate QR scan confirmation (for login flow).
   * Call this after startQrLogin to complete the QR bind.
   */
  function confirmQrScan(qrcodeId) {
    // The login polling will pick this up via the qrcode ID match
    if (qrScanWaiters.length > 0) {
      const waiter = qrScanWaiters.shift();
      waiter({
        ret: 0,
        status: 'confirmed',
        bot_token: TOKEN,
        ilink_bot_id: MOCK_BOT.ilink_bot_id,
        baseurl: `http://localhost:${PORT}`,
        ilink_user_id: MOCK_BOT.ilink_user_id,
      });
    }
  }

  // ── Internal ───────────────────────────────────────────────────────

  const qrScanWaiters = [];

  function queueUpdate() {
    if (updateWaiters.length > 0) {
      const waiter = updateWaiters.shift();
      const msgs = pendingMessages.splice(0);
      waiter(msgs);
    }
  }

  function jsonResponse(res, data) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  function handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // Auth check for POST requests
    if (req.method === 'POST') {
      const auth = req.headers['authorization'];
      if (!auth || !auth.includes(TOKEN)) {
        jsonResponse(res, { ret: -1, retmsg: 'Unauthorized' });
        return;
      }
    }

    if (req.method === 'GET' && url.pathname === '/ilink/bot/get_bot_qrcode') {
      const qrcodeId = 'qr_mock_' + Date.now();
      console.log('  [MockWeChat] get_bot_qrcode →', qrcodeId);
      jsonResponse(res, {
        ret: 0,
        qrcode: qrcodeId,
        qrcode_img_content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/ilink/bot/get_qrcode_status') {
      const qrcode = url.searchParams.get('qrcode');
      console.log('  [MockWeChat] get_qrcode_status → wait');

      // Long-poll: wait for confirmQrScan or timeout
      const timer = setTimeout(() => {
        const idx = qrScanWaiters.indexOf(waiter);
        if (idx >= 0) qrScanWaiters.splice(idx, 1);
        console.log('  [MockWeChat] get_qrcode_status → timeout (still waiting)');
        // Return "wait" so the poller retries
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ret: 0, status: 'wait' }));
      }, 30000);

      const waiter = (data) => {
        clearTimeout(timer);
        console.log('  [MockWeChat] get_qrcode_status →', data.status);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      qrScanWaiters.push(waiter);

      req.on('close', () => {
        clearTimeout(timer);
        const idx = qrScanWaiters.indexOf(waiter);
        if (idx >= 0) qrScanWaiters.splice(idx, 1);
      });
      return;
    }

    // POST endpoints
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {}

      if (url.pathname === '/ilink/bot/getupdates') {
        const msgs = pendingMessages.splice(0);
        console.log('  [MockWeChat] getupdates →', msgs.length, 'msg(s)');

        jsonResponse(res, {
          ret: 0,
          sync_buf: '',
          get_updates_buf: 'buf_' + Date.now(),
          msgs: msgs.length > 0 ? msgs : undefined,
        });
        return;
      }

      if (url.pathname === '/ilink/bot/sendmessage') {
        const msg = body.msg;
        sentMessages.push(msg);
        console.log('  [MockWeChat] sendmessage → from=' + (msg?.from_user_id || '?') +
          ' to=' + (msg?.to_user_id || '?') +
          ' text=' + JSON.stringify(msg?.item_list?.[0]?.text_item?.text || '').substring(0, 60));
        jsonResponse(res, { ret: 0 });
        return;
      }

      if (url.pathname === '/ilink/bot/getuploadurl') {
        console.log('  [MockWeChat] getuploadurl');
        jsonResponse(res, { errcode: 0, url: 'http://localhost/upload', aes_key: 'mock_key', encrypt_query_param: 'mock_param' });
        return;
      }

      jsonResponse(res, { ret: -1, retmsg: 'Unknown endpoint' });
    });
  }

  function start() {
    return new Promise((resolve, reject) => {
      if (server) { resolve(); return; }
      server = http.createServer(handleRequest);
      server.on('error', reject);
      server.listen(PORT, () => {
        console.log(`  [MockWeChat] listening on port ${PORT} (token: ${TOKEN}, bot: ${MOCK_BOT.ilink_bot_id})`);
        resolve();
      });
    });
  }

  function stop() {
    return new Promise((resolve) => {
      for (const w of qrScanWaiters) { w({ ret: 0, status: 'expired' }); }
      qrScanWaiters.length = 0;
      pendingMessages.length = 0;
      if (!server) { resolve(); return; }
      server.close(() => { server = null; resolve(); });
    });
  }

  return { start, stop, simulateUserText, simulateBotMessage, confirmQrScan, getSentMessages, clearSentMessages, waitForSentMessages, MOCK_BOT, TOKEN, PORT };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let port = 9930, token = 'test-wechat-token';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i+1]) { port = parseInt(args[i+1], 10); i++; }
    if (args[i] === '--token' && args[i+1]) { token = args[i+1]; i++; }
  }
  const mock = createMockWeChatServer({ port, token });
  mock.start().then(() => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   Mock WeChat Bot API Server                             ║');
    console.log(`║   URL:    http://localhost:${String(port).padEnd(38)}║`);
    console.log(`║   Token:  ${token.padEnd(44)}║`);
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
  });
}

module.exports = { createMockWeChatServer };
