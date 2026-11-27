const ONLINE_MS = 45_000;

/**
 * In-memory state for Agents that dial out to the Hub (cloud / Render).
 */
export default class AgentRelay {
  constructor() {
    /** @type {Map<string, object>} */
    this.agents = new Map();
  }

  upsert(peerId, payload = {}) {
    const id = String(peerId || '').trim();
    if (!id) throw new Error('peerId is required');

    const prev = this.agents.get(id) || {};
    const next = {
      id,
      name: String(payload.name || prev.name || id),
      address: String(payload.address || prev.address || ''),
      url: String(payload.url || prev.url || ''),
      printers: Array.isArray(payload.printers) ? payload.printers : prev.printers || [],
      info: payload.info || prev.info || null,
      lastSeen: Date.now(),
      mode: 'relay',
    };
    this.agents.set(id, next);
    return next;
  }

  get(peerId) {
    return this.agents.get(String(peerId || '')) || null;
  }

  isOnline(peerId) {
    const agent = this.get(peerId);
    if (!agent) return false;
    return Date.now() - agent.lastSeen < ONLINE_MS;
  }

  listOnline() {
    const now = Date.now();
    return [...this.agents.values()].filter((a) => now - a.lastSeen < ONLINE_MS);
  }
}
