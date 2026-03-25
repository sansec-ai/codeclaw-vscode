import { readFileSync, writeFileSync, chmodSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { platform } from "node:process";

/**
 * Load a JSON file, returning a typed object or the fallback if the file
 * does not exist or cannot be parsed.
 */
export function loadJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    // Ignore ENOENT silently
    return fallback;
  }
}

/**
 * Persist an object as pretty-printed JSON.
 * File is written with mode 0o600 (owner read/write only).
 */
export function saveJson(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const raw = JSON.stringify(data, null, 2) + "\n";
  writeFileSync(filePath, raw, "utf-8");
  if (platform !== 'win32') {
    chmodSync(filePath, 0o600);
  }
}

// ========== Instance Lock (prevents multiple VSCode instances from running the same daemon) ==========

const LOCK_DIR = join(tmpdir(), 'wechat-claude-vscode-locks');

export interface LockHandle {
  /** Unique lock file path for this account */
  path: string;
  /** PID that acquired the lock */
  pid: number;
}

/**
 * Try to acquire an exclusive lock for the given account ID.
 * Returns the lock handle on success, or null if another instance holds it.
 *
 * Uses 'wx' flag (exclusive create) for atomic cross-process locking.
 * On stale lock (holder PID dead), cleans up and retries once.
 */
export function acquireInstanceLock(accountId: string): LockHandle | null {
  const lockPath = join(LOCK_DIR, `${accountId}.lock`);
  mkdirSync(LOCK_DIR, { recursive: true });

  const myPid = process.pid;
  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Try to create the lock file exclusively — fails if already exists
      writeFileSync(lockPath, String(myPid), { flag: 'wx' });
      return { path: lockPath, pid: myPid };
    } catch (err: any) {
      if (err.code === 'EEXIST' && attempt < maxAttempts - 1) {
        // Lock file exists — check if the holder is still alive
        try {
          const holderPid = parseInt(readFileSync(lockPath, 'utf-8').trim(), 10);
          if (isNaN(holderPid)) {
            // Corrupted lock file — remove and retry
            try { unlinkSync(lockPath); } catch {}
            continue;
          }

          if (isProcessAlive(holderPid)) {
            // Another instance is running
            return null;
          } else {
            // Stale lock — the holder process is gone
            try { unlinkSync(lockPath); } catch {}
            continue;
          }
        } catch {
          return null;
        }
      }
      // Other errors or final attempt
      return null;
    }
  }
  return null;
}

/**
 * Release the instance lock.
 */
export function releaseInstanceLock(lock: LockHandle): void {
  try {
    unlinkSync(lock.path);
  } catch {
    // Ignore — lock may have been cleaned up
  }
}

/**
 * Check if a process with the given PID is still alive.
 */
function isProcessAlive(pid: number): boolean {
  try {
    // Sending signal 0 doesn't kill the process, just checks existence
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
