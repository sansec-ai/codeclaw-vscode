import { logger } from '../logger';
import { t } from '../i18n';

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ChecklistState {
  items: TodoItem[];
  total: number;
  completed: number;
  inProgress: number;
  lastReportedCompleted: number;
}

/**
 * Track Claude Code's TodoWrite tool calls and detect checklist changes.
 *
 * Budget model:
 *   WeChat ClawBot allows ~10 messages per context_token.
 *   We MUST reserve 1 slot for the final result.
 *   So we have at most 9 slots for checklist updates.
 *
 *   When a checklist has N items, we batch by:
 *     batchSize = max(1, floor(9 / ceil(N / itemsPerBatch)))
 *
 *   Or more simply: every time `completed - lastReported` >= threshold,
 *   send one update. threshold = max(1, ceil(total / 9)).
 */
export class ChecklistTracker {
  private state: ChecklistState | null = null;
  private maxUpdates: number;

  /**
   * @param maxUpdates Maximum checklist update messages to send (default 9, reserve 1 for result)
   */
  constructor(maxUpdates: number = 9) {
    this.maxUpdates = maxUpdates;
  }

  /**
   * Reset tracker for a new query.
   */
  reset(): void {
    this.state = null;
  }

  /**
   * Extract TodoWrite data from an assistant message's content blocks.
   * Returns the parsed todo items, or null if no TodoWrite found.
   */
  extractTodos(message: any): TodoItem[] | null {
    try {
      const apiMessage = message?.message;
      if (!apiMessage?.content) return null;

      const blocks = Array.isArray(apiMessage.content) ? apiMessage.content : [];

      for (const block of blocks) {
        if (block.type === 'tool_use' && block.name === 'TodoWrite' && block.input) {
          const todos = block.input.todos;
          if (Array.isArray(todos) && todos.length > 0) {
            return todos.map((t: any) => ({
              content: String(t.content ?? ''),
              status: t.status === 'completed' ? 'completed' as const
                : t.status === 'in_progress' ? 'in_progress' as const
                  : 'pending' as const,
            }));
          }
        }
      }
    } catch {
      // Silently ignore parse errors
    }
    return null;
  }

  /**
   * Process an assistant message and return a formatted checklist update
   * if the completed count has changed enough to warrant sending.
   * Returns null if no update should be sent.
   */
  checkUpdate(message: any): string | null {
    const todos = this.extractTodos(message);
    if (!todos || todos.length === 0) return null;

    const total = todos.length;
    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;

    // Initialize or update state
    if (!this.state) {
      this.state = { items: todos, total, completed, inProgress, lastReportedCompleted: 0 };
      logger.info('Checklist detected', { total, completed });
      return null; // Don't send on first detection, wait for progress
    }

    // Update state
    this.state.items = todos;
    this.state.total = total;
    this.state.completed = completed;
    this.state.inProgress = inProgress;

    // Calculate threshold: how many completions per update
    const threshold = Math.max(1, Math.ceil(total / this.maxUpdates));

    const newlyCompleted = completed - this.state.lastReportedCompleted;
    if (newlyCompleted >= threshold || (completed === total && this.state.lastReportedCompleted < total)) {
      this.state.lastReportedCompleted = completed;
      logger.info('Checklist update', { total, completed, inProgress, threshold, newlyCompleted });

      return this.formatChecklist();
    }

    return null;
  }

  /**
   * Format the current checklist state for WeChat.
   */
  private formatChecklist(): string {
    if (!this.state) return '';

    const { total, completed, inProgress, items } = this.state;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    const bar = this.buildProgressBar(progress);

    const lines: string[] = [
      `📋 ${t('checklistProgress', String(progress))}`,
      bar,
      '',
    ];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const checkbox = item.status === 'completed' ? '✅'
        : item.status === 'in_progress' ? '🔄'
          : '⬜';
      lines.push(`${checkbox} ${item.content}`);
    }

    return lines.join('\n');
  }

  private buildProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${this.completed}/${this.total}`;
  }

  /** Format helper (used in buildProgressBar) */
  private get completed(): number {
    return this.state?.completed ?? 0;
  }

  /** Format helper (used in buildProgressBar) */
  private get total(): number {
    return this.state?.total ?? 0;
  }

  /**
   * Get remaining update budget.
   */
  getRemainingBudget(): number {
    if (!this.state) return this.maxUpdates;
    // Count how many updates we've already sent
    const sent = this.state.lastReportedCompleted > 0 ? 1 : 0;
    // Rough estimate based on threshold
    const threshold = Math.max(1, Math.ceil(this.state.total / this.maxUpdates));
    const used = Math.floor(this.state.lastReportedCompleted / threshold);
    return Math.max(0, this.maxUpdates - used);
  }
}
