import { logger } from './logger';
import { t } from './i18n';
import type { PendingPermission } from './session';

const PERMISSION_TIMEOUT = 120_000;
const GRACE_PERIOD = 15_000;

export type OnPermissionTimeout = () => void;

export function createPermissionBroker(onTimeout?: OnPermissionTimeout) {
  const pending = new Map<string, PendingPermission>();
  const timedOut = new Map<string, number>();

  function createPending(accountId: string, toolName: string, toolInput: string): Promise<boolean> {
    const existing = pending.get(accountId);
    if (existing) {
      clearTimeout(existing.timer);
      pending.delete(accountId);
      existing.resolve(false);
      logger.warn('Replaced existing pending permission', { accountId, toolName: existing.toolName });
    }

    timedOut.delete(accountId);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        logger.warn('Permission timeout, auto-denied', { accountId, toolName });
        pending.delete(accountId);
        timedOut.set(accountId, Date.now());
        setTimeout(() => timedOut.delete(accountId), GRACE_PERIOD);
        resolve(false);
        onTimeout?.();
      }, PERMISSION_TIMEOUT);

      pending.set(accountId, { toolName, toolInput, resolve, timer });
    });
  }

  function resolvePermission(accountId: string, allowed: boolean): boolean {
    const perm = pending.get(accountId);
    if (!perm) return false;
    clearTimeout(perm.timer);
    pending.delete(accountId);
    perm.resolve(allowed);
    logger.info('Permission resolved', { accountId, toolName: perm.toolName, allowed });
    return true;
  }

  function isTimedOut(accountId: string): boolean {
    return timedOut.has(accountId);
  }

  function clearTimedOut(accountId: string): void {
    timedOut.delete(accountId);
  }

  function getPending(accountId: string): PendingPermission | undefined {
    return pending.get(accountId);
  }

  function formatPendingMessage(perm: PendingPermission): string {
    return [
      t('permissionRequestTitle'),
      '',
      t('permissionToolLabel', perm.toolName),
      t('permissionInputLabel', perm.toolInput.slice(0, 500)),
      '',
      t('permissionReplyHint'),
      t('permissionTimeoutHint'),
    ].join('\n');
  }

  function rejectPending(accountId: string): boolean {
    const perm = pending.get(accountId);
    if (!perm) return false;
    clearTimeout(perm.timer);
    pending.delete(accountId);
    perm.resolve(false);
    logger.info('Permission auto-rejected (session cleared)', { accountId, toolName: perm.toolName });
    return true;
  }

  return { createPending, resolvePermission, rejectPending, isTimedOut, clearTimedOut, getPending, formatPendingMessage };
}
