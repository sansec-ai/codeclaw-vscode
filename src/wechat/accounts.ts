import { join } from 'node:path';
import { homedir } from 'node:os';
import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { loadJson, saveJson } from '../store';
import { logger } from '../logger';

export const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
export const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';

export interface AccountData {
  botToken: string;
  accountId: string;
  baseUrl: string;
  userId: string;
  createdAt: string;
  /** The VSCode workspace directory that was bound to this account */
  boundCwd?: string;
}

const ACCOUNTS_DIR = join(homedir(), '.wechat-claude-vscode', 'accounts');

function validateAccountId(accountId: string): void {
  if (!/^[a-zA-Z0-9_.@=-]+$/.test(accountId)) {
    throw new Error(`Invalid accountId: "${accountId}"`);
  }
}

function accountPath(accountId: string): string {
  validateAccountId(accountId);
  return join(ACCOUNTS_DIR, `${accountId}.json`);
}

export function saveAccount(data: AccountData): void {
  const filePath = accountPath(data.accountId);
  saveJson(filePath, data);
  logger.info('Account saved', { accountId: data.accountId });
}

export function loadAccount(accountId: string): AccountData | null {
  const filePath = accountPath(accountId);
  const data = loadJson<AccountData | null>(filePath, null);
  if (data) {
    logger.info('Account loaded', { accountId });
  }
  return data;
}

export function loadLatestAccount(): AccountData | null {
  try {
    const files = readdirSync(ACCOUNTS_DIR).filter((f) => f.endsWith('.json'));
    if (files.length === 0) return null;

    let latestFile = files[0];
    let latestMtime = 0;

    for (const file of files) {
      const stat = statSync(join(ACCOUNTS_DIR, file));
      if (stat.mtimeMs > latestMtime) {
        latestMtime = stat.mtimeMs;
        latestFile = file;
      }
    }

    const accountId = latestFile.replace(/\.json$/, '');
    return loadAccount(accountId);
  } catch {
    return null;
  }
}

export function deleteAccount(accountId: string): boolean {
  const filePath = accountPath(accountId);
  if (!existsSync(filePath)) return false;
  try {
    unlinkSync(filePath);
    logger.info('Account deleted', { accountId });
    return true;
  } catch (err) {
    logger.error('Failed to delete account', { accountId, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
