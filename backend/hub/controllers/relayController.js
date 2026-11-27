import fs from 'fs';

export default function createRelayController({ peerStore, relay, jobQueue }) {
  function resolvePeer(body = {}, query = {}) {
    const peerId = String(body.peerId || body.id || query.peerId || query.id || '').trim();
    if (peerId) {
      const byId = peerStore.findById(peerId);
      if (byId) return byId;
    }

    const address = String(body.address || query.address || '').trim().toLowerCase();
    if (address) {
      const peers = peerStore.list();
      const match = peers.find((p) => {
        const addr = String(p.address || '').toLowerCase();
        const url = String(p.url || '').toLowerCase();
        return addr === address || addr.startsWith(address) || url.includes(address);
      });
      if (match) return match;
    }

    return null;
  }

  return {
    heartbeat(req, res) {
      try {
        const peer = resolvePeer(req.body, req.query);
        if (!peer) {
          return res.status(404).json({
            error: 'Unknown agent — add this PC in Hub peers first (e.g. 192.168.29.40:4001)',
          });
        }

        const agent = relay.upsert(peer.id, {
          name: req.body?.name || peer.name,
          address: req.body?.address || peer.address,
          url: req.body?.url || peer.url,
          printers: req.body?.printers || [],
          info: req.body?.info || null,
        });

        return res.json({
          ok: true,
          peerId: peer.id,
          onlineWindowSec: 45,
          agent,
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    },

    nextJob(req, res) {
      try {
        const peer = resolvePeer(req.body, req.query);
        if (!peer) {
          return res.status(404).json({ error: 'Unknown agent' });
        }
        // Refresh presence on poll
        if (relay.get(peer.id)) {
          relay.upsert(peer.id, {});
        }
        const job = jobQueue.claimNext(peer.id);
        return res.json({ job });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    },

    downloadJob(req, res) {
      try {
        const job = jobQueue.get(req.params.jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        if (!fs.existsSync(job.filePath)) {
          return res.status(404).json({ error: 'Job file missing' });
        }
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Filename', job.filename);
        return fs.createReadStream(job.filePath).pipe(res);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    },

    completeJob(req, res) {
      try {
        const job = jobQueue.complete(req.params.jobId, req.body || {});
        if (!job) return res.status(404).json({ error: 'Job not found' });
        return res.json({ ok: true });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    },
  };
}
