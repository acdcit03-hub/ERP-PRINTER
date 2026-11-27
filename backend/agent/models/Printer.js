/**
 * In-memory printer cache model for the Agent.
 */
export default class PrinterCache {
  constructor() {
    this.printers = [];
    this.error = null;
    this.updatedAt = null;
  }

  set(printers, error = null) {
    this.printers = Array.isArray(printers) ? printers : [];
    this.error = error;
    this.updatedAt = new Date().toISOString();
  }

  list() {
    return {
      printers: this.printers,
      error: this.error,
      updatedAt: this.updatedAt,
    };
  }

  findByName(name) {
    const target = String(name || '').toLowerCase();
    return this.printers.find((p) => String(p.name || '').toLowerCase() === target) || null;
  }
}
