#!/usr/bin/env node
'use strict';
/**
 * 交互式 Mock Telegram 服务器
 * 
 * 启动后可以：
 *   - 自动被 VSCode 插件发现并连接
 *   - 通过命令行输入文本来模拟用户发送消息
 *   - 实时查看 Bot 的回复
 * 
 * 用法：
 *   node tests/mock-interactive.js
 * 
 * 然后在 VSCode 里：
 *   1. 设置 codeClaw.telegramApiBaseUrl = "http://localhost:19920"
 *   2. 侧边栏 → 切换渠道 → Telegram → 输入 token: e2e-test-token
 *   3. 连接成功后，在此脚本中输入文字 → 发送给 Bot → Bot 回复显示在这里
 */

const readline = require('node:readline');
const { createMockServer } = require('./mock-telegram-server');

const PORT = 19920;
const TOKEN = 'e2e-test-token';

// Mock vscode
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(r, p, i, o) {
  if (r === 'vscode') return 'vscode';
  return origResolve.call(this, r, p, i, o);
};
Module._cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: {} };

async function main() {
  const mock = createMockServer({ port: PORT, token: TOKEN });

  try {
    await mock.start();
  } catch (err) {
    console.error('❌ 启动失败:', err.message);
    console.error('   可能端口 19920 被占用，先 kill: fuser -k 19920/tcp');
    process.exit(1);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   🤖 Mock Telegram 交互服务器                           ║');
  console.log('║                                                          ║');
  console.log('║   Bot:     @codeclaw_test_bot                            ║');
  console.log('║   Token:   e2e-test-token                                ║');
  console.log('║   URL:     http://localhost:19920                        ║');
  console.log('║                                                          ║');
  console.log('║   VSCode 设置:                                           ║');
  console.log('║     codeClaw.telegramApiBaseUrl = "http://localhost:19920"║');
  console.log('║     codeClaw.telegramPollTimeout = 2                     ║');
  console.log('║                                                          ║');
  console.log('║   输入文字 → 模拟用户发消息给 Bot                         ║');
  console.log('║   输入 :q → 退出                                         ║');
  console.log('║   输入 :photo → 发送图片消息                             ║');
  console.log('║   输入 :replies → 查看 Bot 的所有回复                    ║');
  console.log('║   输入 :clear → 清空回复记录                             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.setPrompt('📝 你> ');
  rl.prompt();

  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) { rl.prompt(); return; }

    if (text === ':q' || text === ':quit') {
      console.log('👋 再见！');
      await mock.stop();
      process.exit(0);
    }

    if (text === ':photo') {
      const updateId = mock.simulateUserPhoto('photo_001', '');
      console.log(`  📸 已发送图片消息 (update_id=${updateId})`);
      // Wait for possible reply
      setTimeout(() => showReplies(mock), 3000);
      rl.prompt();
      return;
    }

    if (text === ':replies') {
      showReplies(mock);
      rl.prompt();
      return;
    }

    if (text === ':clear') {
      mock.clearSentMessages();
      console.log('  🗑️  回复记录已清空');
      rl.prompt();
      return;
    }

    // 模拟用户发送文本消息
    const prevCount = mock.getSentMessages().length;
    const updateId = mock.simulateUserText(text);
    console.log(`  ✅ 已发送 (update_id=${updateId})`);

    // 等 Bot 回复（最多 15 秒）
    try {
      await mock.waitForSentMessages(prevCount + 1, 15000);
      const replies = mock.getSentMessages();
      const newReplies = replies.slice(prevCount);
      for (const r of newReplies) {
        const preview = r.text.length > 200 ? r.text.substring(0, 200) + '...' : r.text;
        console.log(`\n  🤖 Bot> ${preview}`);
      }
    } catch {
      console.log('  ⏳ Bot 15 秒内未回复（可能 Claude Code 未就绪）');
    }

    console.log('');
    rl.prompt();
  });

  rl.on('close', async () => {
    await mock.stop();
    process.exit(0);
  });
}

function showReplies(mock) {
  const replies = mock.getSentMessages();
  if (replies.length === 0) {
    console.log('  📭 暂无回复');
    return;
  }
  console.log(`  📋 共 ${replies.length} 条回复:`);
  replies.forEach((r, i) => {
    const preview = r.text.length > 120 ? r.text.substring(0, 120) + '...' : r.text;
    console.log(`  ${i + 1}. [chat=${r.chatId}] ${preview}`);
  });
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
