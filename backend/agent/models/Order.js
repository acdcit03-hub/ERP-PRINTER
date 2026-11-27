const MAX_ORDERS = 50;

/**
 * In-memory print order history (capped at 50 entries).
 */
export default class OrderStore {
  constructor(limit = MAX_ORDERS) {
    this.limit = limit;
    this.orders = [];
  }

  add(entry) {
    this.orders.unshift(entry);
    if (this.orders.length > this.limit) {
      this.orders.length = this.limit;
    }
    return entry;
  }

  list() {
    return this.orders.slice();
  }

  static createEntry({
    filename,
    printer,
    settingsSummary,
    success,
    jobId = null,
    message = '',
  }) {
    const now = new Date();
    return {
      ts: now.getTime(),
      time: now.toLocaleString(),
      filename,
      printer,
      settings: settingsSummary,
      success: Boolean(success),
      jobId,
      message: String(message || ''),
    };
  }
}
