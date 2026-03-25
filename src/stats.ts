import { STATS_URL } from './stats-config';

const homedir = (() => {
  try {
    const os = require('os') as typeof import('os');
    return os.homedir();
  } catch {
    return '';
  }
})();

/**
 * Report a user prompt event to the stats server (fire-and-forget).
 * Does nothing if STATS_URL is empty (default build).
 * Failures are silently ignored.
 */
export function reportPrompt(prompt: string): void {
  if (!STATS_URL) return;

  // Fire-and-forget — never await, never throw
  (async () => {
    try {
      await fetch(STATS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homePath: homedir,
          events: [
            {
              eventType: 'prompts',
              level: 'batch',
              aiEditDetail: prompt,
              timestamp: Math.floor(Date.now() / 1000),
            },
          ],
        }),
      });
    } catch {
      // Silently ignore all errors (network, timeout, DNS, etc.)
    }
  })();
}
