#!/usr/bin/env node
'use strict';
/**
 * Mock Telegram 消息发送工具
 * 
 * 用法：
 *   node tests/mock-send.js "你好 Claude"           # 发送文本消息
 *   node tests/mock-send.js --photo "看看这个"       # 发送图片消息
 *   node tests/mock-send.js --replies               # 查看 Bot 的回复
 *   node tests/mock-send.js --clear                 # 清空回复记录
 *   node tests/mock-send.js --status                # 查看 Mock 服务器状态
 */

const MOCK_PORT = 19920;
const MOCK_TOKEN = 'e2e-test-token';

// Mock vscode so we can import the mock server module
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(r, p, i, o) {
  if (r === 'vscode') return 'vscode';
  return origResolve.call(this, r, p, i, o);
};
Module._cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: {} };

const { createMockServer } = require('./mock-telegram-server');

async function main() {
  const args = process.argv.slice(2);

  // Connect to the already-running mock server by creating a lightweight client
  const mock = createMockServer({ port: MOCK_PORT, token: MOCK_TOKEN });

  // Check if mock server is alive
  try {
    const { TelegramApi } = require('../out/channels/telegram-api');
    const api = new TelegramApi(MOCK_TOKEN, `http://localhost:${MOCK_PORT}`);
    const bot = await api.getMe();
  } catch (err) {
    console.error('❌ Mock 服务器未运行！');
    console.error('   请先启动：node tests/mock-telegram-server.js --port 19920 --token e2e-test-token');
    process.exit(1);
  }

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Mock Telegram 消息工具

用法:
  node tests/mock-send.js "你好 Claude"       发送文本消息
  node tests/mock-send.js --photo "说明文字"  发送图片消息
  node tests/mock-send.js --replies           查看 Bot 的回复
  node tests/mock-send.js --clear             清空回复记录
  node tests/mock-send.js --status            查看服务器状态
`);
    return;
  }

  if (args[0] === '--replies') {
    // We need to start our own mock to read state - but since there's already one running,
    // we'll use the API to check
    console.log('📋 查看回复需要连接到正在运行的 mock 服务器');
    console.log('   提示：回复会显示在 mock 服务器的终端日志中');
    console.log('   也可以查看 VSCode 的 Output → "Code Claw" 频道');
    return;
  }

  if (args[0] === '--clear') {
    console.log('ℹ️  清空回复记录：重启 mock 服务器即可');
    return;
  }

  if (args[0] === '--status') {
    try {
      const { TelegramApi } = require('../out/channels/telegram-api');
      const api = new TelegramApi(MOCK_TOKEN, `http://localhost:${MOCK_PORT}`);
      const bot = await api.getMe();
      console.log('✅ Mock 服务器运行中');
      console.log(`   Bot: @${bot.username} (id=${bot.id})`);
      console.log(`   URL: http://localhost:${MOCK_PORT}`);
      console.log(`   Token: ${MOCK_TOKEN}`);
    } catch {
      console.log('❌ Mock 服务器未运行');
    }
    return;
  }

  // Send a message via direct HTTP
  const isPhoto = args[0] === '--photo';
  const text = isPhoto ? (args[1] || '') : args.join(' ');

  // Push message by calling the mock's simulateUserText through a side channel
  // Since we can't access the running mock's state, we use the TelegramApi directly
  // Actually, we need to use the mock-telegram-server's internal state
  // The simplest way: just use curl to hit the mock server's getUpdates to confirm it's alive
  // and then we need to push an update somehow

  // Actually, the mock server when run standalone doesn't expose simulateUserText externally.
  // We need to run the mock server as a module and use its API.
  // Since there's already one running, we'll note this limitation.

  console.log(`📤 发送消息: "${text}"`);
  console.log('');
  console.log('⚠️  注意: 由于 mock 服务器已在独立进程中运行，');
  console.log('   消息注入需要重启 mock 服务器并使用模块模式。');
  console.log('');
  console.log('   推荐方式:');
  console.log('   1. 停止当前 mock 服务器 (Ctrl+C)');
  console.log('   2. 用集成模式启动:');
  console.log('      node tests/mock-interactive.js');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
