import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { normalizeAgentAddress } from '../../shared/utils/network.js';

/**
 * Peer store persisted to peers.json
 */
export default class PeerStore {
  constructor(filePath, defaultAgentPort = 8001) {
    this.filePath = filePath;
    this.defaultAgentPort = defaultAgentPort;
    this.peers = [];
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.peers = [this._localFallback()];
        this.save();
        return;
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      this.peers = Array.isArray(data) ? data : [];
      if (this.peers.length === 0) {
        this.peers = [this._localFallback()];
        this.save();
      }
    } catch {
      this.peers = [this._localFallback()];
      this.save();
    }
  }

  save() {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.peers, null, 2), 'utf8');
  }

  _localFallback() {
    return {
      id: 'local',
      name: 'Local Agent',
      address: `127.0.0.1:${this.defaultAgentPort}`,
      url: `http://127.0.0.1:${this.defaultAgentPort}`,
      pin: '',
    };
  }

  list() {
    return this.peers.slice();
  }

  findById(id) {
    return this.peers.find((p) => p.id === id) || null;
  }

  findByUrl(url) {
    const target = String(url || '').replace(/\/$/, '').toLowerCase();
    return this.peers.find((p) => String(p.url || '').replace(/\/$/, '').toLowerCase() === target) || null;
  }

  add({ address, name, pin = '' }) {
    const normalized = normalizeAgentAddress(address, this.defaultAgentPort);
    if (this.findByUrl(normalized.baseUrl)) {
      const err = new Error('Agent URL already registered');
      err.code = 'DUPLICATE';
      throw err;
    }

    const peer = {
      id: crypto.randomBytes(8).toString('hex'),
      name: String(name || normalized.host).trim() || normalized.host,
      address: `${normalized.host}:${normalized.port}`,
      url: normalized.baseUrl,
      pin: String(pin || ''),
    };

    this.peers.push(peer);
    this.save();
    return peer;
  }

  remove(id) {
    const before = this.peers.length;
    this.peers = this.peers.filter((p) => p.id !== id);
    if (this.peers.length === before) {
      return false;
    }
    this.save();
    return true;
  }
}
