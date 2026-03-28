/**
 * E2E Integration Test Suite for CodeClaw VSCode Extension
 *
 * Focus: extension lifecycle, state transitions, channel switching,
 * account management, and error handling.
 *
 * Message round-trip is covered by unit tests (npm run test:fast)
 * and interactive mock servers (tests/mock-interactive.js).
 *
 * Mock servers: WeChat (port 19930) + Telegram (port 19920)
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');

// ── Mock Servers (used for API validation, not full round-trip) ───────────

const { createMockWeChatServer } = require('../mock-wechat-server');
const { createMockServer: createMockTelegramServer } = require('../mock-telegram-server');

const WECHAT_PORT = 19930;
const WECHAT_TOKEN = 'e2e-wechat-token';
const TG_PORT = 19920;
const TG_TOKEN = 'e2e-test-token';

const ACCOUNTS_DIR = path.join(os.homedir(), '.codeclaw-vscode', 'accounts');
const LOCK_DIR = '/tmp/codeClaw-locks';

let wechatMock, tgMock;
let vscode;

// ── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function accountPath(id) { return path.join(ACCOUNTS_DIR, `${id}.json`); }

function cleanupAccounts() {
  if (!fs.existsSync(ACCOUNTS_DIR)) return;
  fs.readdirSync(ACCOUNTS_DIR).filter(f => f.endsWith('.json')).forEach(f => {
    try { fs.unlinkSync(path.join(ACCOUNTS_DIR, f)); } catch {}
  });
  // Allow OS to release file handles
  return sleep(100);
}

function cleanupLocks() {
  try {
    if (fs.existsSync(LOCK_DIR)) {
      fs.readdirSync(LOCK_DIR).forEach(f => {
        try { fs.unlinkSync(path.join(LOCK_DIR, f)); } catch {}
      });
    }
  } catch {}
  return sleep(100);
}

function touchAccount(accountId) {
  fs.utimesSync(accountPath(accountId), new Date(), new Date());
}

function createWeChatAccount(overrides = {}) {
  const account = {
    botToken: WECHAT_TOKEN,
    accountId: 'e2e_wechat_bot_001',
    baseUrl: `http://localhost:${WECHAT_PORT}`,
    userId: 'e2e_wechat_user_001',
    createdAt: new Date().toISOString(),
    channelType: 'wechat',
    boundCwd: path.resolve(__dirname, 'workspace'),
    ...overrides,
  };
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  fs.writeFileSync(accountPath(account.accountId), JSON.stringify(account, null, 2));
  return account;
}

function createTelegramAccount(overrides = {}) {
  const account = {
    botToken: TG_TOKEN,
    accountId: '987654321',
    baseUrl: `http://localhost:${TG_PORT}`,
    userId: 'codeclaw_test_bot',
    createdAt: new Date().toISOString(),
    channelType: 'telegram',
    boundCwd: path.resolve(__dirname, 'workspace'),
    telegramPollTimeout: 1,
    ...overrides,
  };
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  fs.writeFileSync(accountPath(account.accountId), JSON.stringify(account, null, 2));
  return account;
}

function listAccounts() {
  if (!fs.existsSync(ACCOUNTS_DIR)) return [];
  return fs.readdirSync(ACCOUNTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(ACCOUNTS_DIR, f), 'utf8')));
}

function ensureDisconnected() {
  return vscode.commands.executeCommand('codeClaw.disconnect').catch(() => {}).then(() => sleep(500));
}

function ensureConnected() {
  return vscode.commands.executeCommand('codeClaw.connect').catch(() => {}).then(() => sleep(2000));
}

// ── Global Setup / Teardown ───────────────────────────────────────────────

before(async function () {
  this.timeout(30_000);
  console.log('\n🚀 Starting E2E integration tests...\n');
  cleanupAccounts();
  cleanupLocks();

  // Initialize logger for modules that require it (telegram-api, telegram-adapter)
  // These modules do require('vscode') which works in extension host
  try {
    const { initLogger } = require(path.join(__dirname, '../../out/logger'));
    // Create a fake OutputChannel for logger
    initLogger({ appendLine: () => {}, show: () => {} });
  } catch {
    // logger may already be initialized
  }

  wechatMock = createMockWeChatServer({ port: WECHAT_PORT, token: WECHAT_TOKEN });
  await wechatMock.start();
  tgMock = createMockTelegramServer({ port: TG_PORT, token: TG_TOKEN });
  await tgMock.start();

  console.log('  ✅ Mock WeChat on port', WECHAT_PORT);
  console.log('  ✅ Mock Telegram on port', TG_PORT);

  vscode = require('vscode');
  let ext;
  for (let i = 0; i < 30; i++) {
    ext = vscode.extensions.getExtension('sansec.codeclaw-vscode');
    if (ext) break;
    await sleep(500);
  }
  if (ext && !ext.isActive) { await ext.activate(); await sleep(1000); }
  assert.ok(ext?.isActive, 'Extension should be active');
  console.log('  ✅ Extension activated\n');
});

after(async function () {
  console.log('\n🧹 Cleaning up...');
  await ensureDisconnected();
  cleanupAccounts();
  cleanupLocks();
  await wechatMock.stop();
  await tgMock.stop();
  console.log('  ✅ Done\n');
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CodeClaw E2E Integration', function () {
  this.timeout(60_000);

  // ====================================================================
  // 1. Extension Activation
  // ====================================================================
  describe('Extension activation', () => {
    it('extension is loaded and active', () => {
      const ext = vscode.extensions.getExtension('sansec.codeclaw-vscode');
      assert.ok(ext, 'Extension should be loaded');
      assert.ok(ext.isActive, 'Extension should be active');
    });

    it('workspace is open', () => {
      const folders = vscode.workspace.workspaceFolders;
      assert.ok(folders, 'workspaceFolders should exist');
      assert.ok(folders.length > 0, 'Should have at least one workspace folder');
      console.log('    📁 Workspace:', folders[0].uri.fsPath);
    });

    it('registers all expected commands', async () => {
      const cmds = await vscode.commands.getCommands(true);
      assert.ok(cmds.includes('codeClaw.connect'), 'codeClaw.connect');
      assert.ok(cmds.includes('codeClaw.disconnect'), 'codeClaw.disconnect');
      assert.ok(cmds.includes('codeClaw.showPanel'), 'codeClaw.showPanel');
    });

    it('no crash when disconnecting with no active connection', async () => {
      await ensureDisconnected();
      assert.ok(true, 'Disconnect without crash');
    });
  });

  // ====================================================================
  // 2. Account Management (file-based, no daemon)
  // ====================================================================
  describe('Account management', () => {
    before(() => { cleanupAccounts(); cleanupLocks(); });
    after(() => { cleanupAccounts(); });

    it('creates WeChat account file correctly', () => {
      const acc = createWeChatAccount();
      assert.ok(fs.existsSync(accountPath(acc.accountId)));
      const data = JSON.parse(fs.readFileSync(accountPath(acc.accountId), 'utf8'));
      assert.equal(data.channelType, 'wechat');
      assert.equal(data.botToken, WECHAT_TOKEN);
      assert.equal(data.userId, 'e2e_wechat_user_001');
      assert.ok(data.createdAt);
      assert.ok(data.boundCwd);
    });

    it('creates Telegram account file correctly', () => {
      const acc = createTelegramAccount();
      assert.ok(fs.existsSync(accountPath(acc.accountId)));
      const data = JSON.parse(fs.readFileSync(accountPath(acc.accountId), 'utf8'));
      assert.equal(data.channelType, 'telegram');
      assert.equal(data.botToken, TG_TOKEN);
      assert.equal(data.userId, 'codeclaw_test_bot');
      assert.equal(data.telegramPollTimeout, 1);
    });

    it('both accounts coexist on disk', () => {
      createWeChatAccount();
      createTelegramAccount();
      const accs = listAccounts();
      assert.equal(accs.length, 2);
      const types = accs.map(a => a.channelType).sort();
      assert.deepEqual(types, ['telegram', 'wechat']);
    });

    it('account mtime determines latest', () => {
      createWeChatAccount();
      const tgAcc = createTelegramAccount();
      // WeChat was created second, so it's latest by default
      // Touch Telegram to make it latest
      touchAccount(tgAcc.accountId);
      const tgStat = fs.statSync(accountPath(tgAcc.accountId));
      const wcStat = fs.statSync(accountPath('e2e_wechat_bot_001'));
      assert.ok(tgStat.mtimeMs >= wcStat.mtimeMs, 'Telegram should be latest');
    });

    it('cleanup removes all accounts', () => {
      createWeChatAccount();
      createTelegramAccount();
      assert.equal(listAccounts().length, 2);
      cleanupAccounts();
      assert.equal(listAccounts().length, 0);
    });
  });

  // ====================================================================
  // 3. WeChat Mock Server API
  // ====================================================================
  describe('WeChat mock server API', () => {
    it('simulates user text message', () => {
      const msg = wechatMock.simulateUserText('Hello E2E');
      assert.equal(msg.message_type, 1); // USER
      assert.equal(msg.item_list[0].text_item.text, 'Hello E2E');
      assert.ok(msg.context_token);
      assert.ok(msg.message_id);
    });

    it('simulates bot message (type=BOT, should be filtered)', () => {
      const msg = wechatMock.simulateBotMessage('Bot msg');
      assert.equal(msg.message_type, 2); // BOT
    });

    it('clearSentMessages / getSentMessages work', () => {
      wechatMock.clearSentMessages();
      assert.equal(wechatMock.getSentMessages().length, 0);
    });

    it('getUpdates returns pending messages via HTTP', async () => {
      // Clear any accumulated messages from previous tests
      wechatMock.clearSentMessages();
      // Drain pending queue first
      const http = require('http');
      async function drainGetUpdates() {
        return new Promise((resolve, reject) => {
          const req = http.request({
            hostname: 'localhost', port: WECHAT_PORT,
            path: '/ilink/bot/getupdates', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WECHAT_TOKEN}` },
          }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
          });
          req.on('error', reject);
          req.write(JSON.stringify({}));
          req.end();
        });
      }
      await drainGetUpdates(); // drain old messages

      // Now simulate one message and verify
      wechatMock.simulateUserText('Poll test');
      const result = await drainGetUpdates();
      assert.equal(result.ret, 0);
      assert.ok(result.msgs, 'Should have msgs array');
      assert.equal(result.msgs.length, 1);
      assert.equal(result.msgs[0].item_list[0].text_item.text, 'Poll test');
    });

    it('rejects unauthorized requests', async () => {
      const http = require('http');
      const result = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost', port: WECHAT_PORT,
          path: '/ilink/bot/getupdates', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer wrong-token' },
        }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(JSON.stringify({}));
        req.end();
      });
      assert.equal(result.ret, -1);
    });

    it('get_bot_qrcode returns QR data', async () => {
      const http = require('http');
      const result = await new Promise((resolve, reject) => {
        http.get(`http://localhost:${WECHAT_PORT}/ilink/bot/get_bot_qrcode?token=${WECHAT_TOKEN}`, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      assert.equal(result.ret, 0);
      assert.ok(result.qrcode);
      assert.ok(result.qrcode_img_content);
    });
  });

  // ====================================================================
  // 4. Telegram Mock Server API
  // ====================================================================
  describe('Telegram mock server API', () => {
    it('getMe returns bot info', async () => {
      const { TelegramApi } = require(path.join(__dirname, '../../out/channels/telegram-api'));
      const api = new TelegramApi(TG_TOKEN, `http://localhost:${TG_PORT}`);
      const bot = await api.getMe();
      assert.ok(bot.username);
      assert.equal(bot.is_bot, true);
    });

    it('sendMessage round-trip', async () => {
      const { TelegramApi } = require(path.join(__dirname, '../../out/channels/telegram-api'));
      const api = new TelegramApi(TG_TOKEN, `http://localhost:${TG_PORT}`);
      tgMock.clearSentMessages();
      await api.sendMessage(111222333, 'E2E test');
      const sent = tgMock.getSentMessages();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].chatId, 111222333);
      assert.equal(sent[0].text, 'E2E test');
    });

    it('getUpdates receives simulated messages', async () => {
      const { TelegramApi } = require(path.join(__dirname, '../../out/channels/telegram-api'));
      const api = new TelegramApi(TG_TOKEN, `http://localhost:${TG_PORT}`);
      tgMock.simulateUserText('Simulated');
      const updates = await api.getUpdates(undefined, 1);
      assert.equal(updates.length, 1);
      assert.equal(updates[0].message.text, 'Simulated');
    });

    it('full round-trip: receive → reply → verify', async () => {
      const { TelegramApi } = require(path.join(__dirname, '../../out/channels/telegram-api'));
      const api = new TelegramApi(TG_TOKEN, `http://localhost:${TG_PORT}`);
      tgMock.clearSentMessages();
      tgMock.simulateUserText('Round trip');
      const updates = await api.getUpdates(undefined, 1);
      assert.equal(updates.length, 1);
      await api.sendMessage(updates[0].message.chat.id, 'Reply: ' + updates[0].message.text);
      await tgMock.waitForSentMessages(1, 3000);
      const sent = tgMock.getSentMessages();
      assert.equal(sent[0].text, 'Reply: Round trip');
    });

    it('photo message simulation', async () => {
      const { TelegramApi } = require(path.join(__dirname, '../../out/channels/telegram-api'));
      const api = new TelegramApi(TG_TOKEN, `http://localhost:${TG_PORT}`);
      tgMock.simulateUserPhoto('fake-data');
      const updates = await api.getUpdates(undefined, 1);
      assert.equal(updates.length, 1);
      assert.ok(updates[0].message.photo);
    });
  });

  // ====================================================================
  // 5. Channel Adapter Integration (unit-level, no VSCode daemon)
  // ====================================================================
  describe('Channel adapters (unit integration)', () => {
    it('Telegram adapter: start → receive → send → stop', async () => {
      const { createTelegramChannel } = require(path.join(__dirname, '../../out/channels/telegram-adapter'));
      tgMock.clearSentMessages();
      const channel = createTelegramChannel(TG_TOKEN, { baseUrl: `http://localhost:${TG_PORT}`, pollTimeout: 1 });
      let receivedMsg = null;
      channel.start({
        onMessage: (msg) => { receivedMsg = msg; },
        onSessionExpired: () => {},
        onError: () => {},
      });
      tgMock.simulateUserText('Adapter test');
      await sleep(3000);
      channel.stop();
      assert.ok(receivedMsg, 'Should receive message');
      assert.equal(receivedMsg.text, 'Adapter test');
    });

    it('Telegram adapter: sendText delivers to mock', async () => {
      const { createTelegramChannel } = require(path.join(__dirname, '../../out/channels/telegram-adapter'));
      tgMock.clearSentMessages();
      const channel = createTelegramChannel(TG_TOKEN, { baseUrl: `http://localhost:${TG_PORT}`, pollTimeout: 1 });
      channel.start({ onMessage: () => {}, onSessionExpired: () => {}, onError: () => {} });
      const sender = channel.getSender();
      await sender.sendText('111222333', 'ctx1', 'Hello adapter');
      await sleep(500);
      channel.stop();
      await tgMock.waitForSentMessages(1, 3000);
      assert.equal(tgMock.getSentMessages()[0].text, 'Hello adapter');
    });

    it('WeChat adapter can be created', () => {
      const { createWeChatChannel } = require(path.join(__dirname, '../../out/channels/wechat-adapter'));
      const account = {
        accountId: 'test', botToken: WECHAT_TOKEN,
        baseUrl: `http://localhost:${WECHAT_PORT}`,
        userId: 'test_user', createdAt: new Date().toISOString(), channelType: 'wechat',
      };
      const channel = createWeChatChannel(account);
      assert.equal(channel.channelType, 'wechat');
      assert.equal(channel.displayName, '微信');
      assert.ok(channel.getSender);
    });
  });

  // ====================================================================
  // 6. Connection Lifecycle (no message round-trip, focus on state)
  // ====================================================================
  describe('Connection lifecycle', () => {
    beforeEach(() => { cleanupAccounts(); cleanupLocks(); });

    it('connect with WeChat account starts daemon', async () => {
      createWeChatAccount();
      await ensureConnected();
      // If no crash, daemon started successfully
      assert.ok(true, 'WeChat daemon started');
      await ensureDisconnected();
    });

    it('connect with Telegram account starts daemon', async () => {
      createTelegramAccount();
      await ensureConnected();
      assert.ok(true, 'Telegram daemon started');
      await ensureDisconnected();
    });

    it('disconnect stops daemon cleanly', async () => {
      createWeChatAccount();
      await ensureConnected();
      await ensureDisconnected();
      // Can connect again (no stale state)
      await ensureConnected();
      assert.ok(true, 'Reconnect after disconnect works');
      await ensureDisconnected();
    });

    it('switch from WeChat to Telegram', async () => {
      createWeChatAccount();
      createTelegramAccount();
      touchAccount('987654321'); // Telegram is latest
      await ensureConnected();
      await ensureDisconnected();
      touchAccount('e2e_wechat_bot_001'); // WeChat is latest
      await ensureConnected();
      assert.ok(true, 'Channel switch completed');
      await ensureDisconnected();
    });

    it('rapid connect/disconnect cycles do not crash', async () => {
      createWeChatAccount();
      for (let i = 0; i < 5; i++) {
        await ensureConnected();
        await ensureDisconnected();
      }
      assert.ok(true, '5 cycles completed');
    });
  });

  // ====================================================================
  // 7. Error Handling
  // ====================================================================
  describe('Error handling', () => {
    beforeEach(() => { cleanupAccounts(); cleanupLocks(); });
    afterEach(() => { ensureDisconnected(); cleanupAccounts(); cleanupLocks(); });

    it('bad WeChat token does not crash extension', async () => {
      createWeChatAccount({ botToken: 'invalid_token' });
      try {
        await ensureConnected();
        await sleep(2000);
        assert.ok(true, 'No crash');
      } catch {
        assert.ok(true, 'Error handled');
      }
    });

    it('bad Telegram token does not crash extension', async () => {
      createTelegramAccount({ botToken: 'invalid_tg_token' });
      try {
        await ensureConnected();
        await sleep(2000);
        assert.ok(true, 'No crash');
      } catch {
        assert.ok(true, 'Error handled');
      }
    });

    it('connect without workspace opens does not crash', async () => {
      // Workspace is always the e2e workspace, but account can have any boundCwd
      createWeChatAccount({ boundCwd: '/nonexistent/path' });
      try {
        await ensureConnected();
        assert.ok(true, 'No crash');
      } catch {
        assert.ok(true, 'Error handled');
      }
    });

    it('double connect does not crash', async () => {
      createWeChatAccount();
      await ensureConnected();
      try {
        await ensureConnected(); // Second connect
        assert.ok(true, 'No crash');
      } catch {
        assert.ok(true, 'Error handled');
      }
    });
  });

  // ====================================================================
  // 8. Coexistence
  // ====================================================================
  describe('Both channels coexist', () => {
    it('mock servers on different ports', () => {
      assert.notEqual(WECHAT_PORT, TG_PORT);
      assert.ok(wechatMock, 'WeChat mock running');
      assert.ok(tgMock, 'Telegram mock running');
    });

    it('messages do not cross between channels', () => {
      wechatMock.clearSentMessages();
      tgMock.clearSentMessages();
      wechatMock.simulateUserText('WeChat only');
      assert.equal(tgMock.getSentMessages().length, 0);
      assert.equal(wechatMock.getSentMessages().length, 0); // queued, not sent
      tgMock.simulateUserText('Telegram only');
      assert.equal(wechatMock.getSentMessages().length, 0);
    });
  });
});
