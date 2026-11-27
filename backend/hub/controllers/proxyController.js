import fs from 'fs';
import * as proxyService from '../services/proxyService.js';
import { safeBasename } from '../../shared/utils/files.js';

function requirePeer(peerStore, hostId) {
  const peer = peerStore.findById(String(hostId || ''));
  if (!peer) {
    const err = new Error('Unknown host / peer id');
    err.status = 404;
    throw err;
  }
  return peer;
}

function buildAgentQuery(query, omitKeys = ['host']) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (omitKeys.includes(key)) continue;
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export default function createProxyController(peerStore, relay, jobQueue) {
  return {
    async options(req, res) {
      try {
        const peer = requirePeer(peerStore, req.query.host);
        if (relay?.isOnline(peer.id)) {
          return res.json({
            duplex: true,
            color: true,
            orientation: true,
            paperSizes: ['A4', 'Letter', 'Legal'],
            mode: 'relay',
          });
        }
        const qs = buildAgentQuery(req.query);
        const result = await proxyService.getJson(peer, `/api/options?${qs}`);
        return res.status(result.status || 502).json(result.data);
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message });
      }
    },

    async jobs(req, res) {
      try {
        const peer = requirePeer(peerStore, req.query.host);
        if (relay?.isOnline(peer.id)) {
          return res.json({ jobs: [], mode: 'relay' });
        }
        const qs = buildAgentQuery(req.query);
        const result = await proxyService.getJson(peer, `/api/jobs?${qs}`);
        return res.status(result.status || 502).json(result.data);
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message });
      }
    },

    async orders(req, res) {
      try {
        const peer = requirePeer(peerStore, req.query.host);
        if (relay?.isOnline(peer.id)) {
          return res.json({ orders: [], mode: 'relay' });
        }
        const result = await proxyService.getJson(peer, '/api/orders');
        return res.status(result.status || 502).json(result.data);
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message });
      }
    },

    async cancel(req, res) {
      try {
        const peer = requirePeer(peerStore, req.query.host);
        if (relay?.isOnline(peer.id)) {
          return res.status(501).json({ error: 'Cancel via relay is not supported yet' });
        }
        const qs = buildAgentQuery(req.query);
        const result = await proxyService.postJson(peer, `/api/cancel?${qs}`);
        return res.status(result.status || 502).json(result.data);
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message });
      }
    },

    async print(req, res) {
      let tmpPath = null;
      try {
        const peer = requirePeer(peerStore, req.query.host);
        let body;
        let filename;

        if (req.file) {
          tmpPath = req.file.path;
          body = fs.readFileSync(tmpPath);
          filename = safeBasename(
            req.headers['x-filename'] || req.file.originalname || 'document.bin'
          );
        } else if (Buffer.isBuffer(req.body) && req.body.length) {
          body = req.body;
          filename = safeBasename(req.headers['x-filename'] || 'document.bin');
        } else {
          return res.status(400).json({ error: 'File upload required' });
        }

        // Cloud path: queue for Agent pull (Render → office PC)
        if (relay?.isOnline(peer.id) && jobQueue) {
          const printer = String(req.query.printer || '').trim();
          if (!printer) {
            return res.status(400).json({ error: 'printer query parameter is required' });
          }
          const query = { ...req.query };
          delete query.host;
          const job = jobQueue.enqueue({
            peerId: peer.id,
            printer,
            filename,
            body,
            query,
          });
          const finished = await jobQueue.waitFor(job.id, 180000);
          const result = finished.result || { success: false, error: 'No result' };
          const status = result.success ? 200 : 500;
          return res.status(status).json(result);
        }

        const qs = buildAgentQuery(req.query);
        const result = await proxyService.forwardPrint(peer, qs, body, filename);
        return res.status(result.status || 502).json(result.data);
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message });
      } finally {
        if (tmpPath) {
          fs.promises.unlink(tmpPath).catch(() => {});
        }
      }
    },
  };
}
