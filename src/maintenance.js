/**
 * Periodic retention job: drops change-history rows older than the retention window. Flags and
 * their states are kept. Runs once at start and then hourly.
 */
export class Maintenance {
  static INTERVAL_MS = 3_600_000;

  /**
   * @param {object} deps
   * @param {import('./store/history-store.js').HistoryStore} deps.history
   * @param {import('./types.js').Logger} deps.log
   * @param {{ historyRetentionDays: number }} deps.options
   */
  constructor({ history, log, options }) {
    this.history = history;
    this.log = log;
    this.options = options;
    /** @type {NodeJS.Timeout|null} */
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.run();
    this.timer = setInterval(() => this.run(), Maintenance.INTERVAL_MS);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** @param {number} [now] */
  run(now = Date.now()) {
    try {
      const deleted = this.history.purge(now - this.options.historyRetentionDays * 86_400_000);
      if (deleted) this.log.info({ deleted }, 'retention purge removed history rows');
      return deleted;
    } catch (err) {
      this.log.error({ err }, 'maintenance failed');
      return null;
    }
  }
}
