import { scanNetwork } from '../services/scanService.js';

export default function createScanController(peerStore, agentPort) {
  return {
    async scan(req, res) {
      try {
        const registered = peerStore.list().map((p) => p.url);
        const result = await scanNetwork(agentPort, registered);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message || 'Scan failed' });
      }
    },
  };
}
