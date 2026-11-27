import * as proxyService from '../services/proxyService.js';

export default function createAggregateController(peerStore) {
  return {
    async all(req, res) {
      const peers = peerStore.list();
      const hosts = [];
      const printers = [];

      await Promise.all(
        peers.map(async (peer) => {
          try {
            const [infoRes, printersRes] = await Promise.all([
              proxyService.getJson(peer, '/api/info'),
              proxyService.getJson(peer, '/api/printers'),
            ]);

            if (!infoRes.ok || !printersRes.ok) {
              hosts.push({
                id: peer.id,
                name: peer.name,
                address: peer.address,
                url: peer.url,
                online: false,
                error: 'Agent unreachable or error response',
              });
              return;
            }

            hosts.push({
              id: peer.id,
              name: peer.name,
              address: peer.address,
              url: peer.url,
              online: true,
              info: infoRes.data,
              error: printersRes.data?.error || null,
            });

            const list = printersRes.data?.printers || [];
            for (const p of list) {
              printers.push({
                ...p,
                host: peer.id,
                hostName: peer.name,
              });
            }
          } catch (err) {
            hosts.push({
              id: peer.id,
              name: peer.name,
              address: peer.address,
              url: peer.url,
              online: false,
              error: err.message || 'Offline',
            });
          }
        })
      );

      res.json({ hosts, printers });
    },

    async allOrders(req, res) {
      const peers = peerStore.list();
      const orders = [];

      await Promise.all(
        peers.map(async (peer) => {
          try {
            const result = await proxyService.getJson(peer, '/api/orders');
            if (!result.ok) return;
            const list = result.data?.orders || [];
            for (const order of list) {
              orders.push({
                ...order,
                host: peer.name,
                hostId: peer.id,
              });
            }
          } catch {
            // skip offline peers
          }
        })
      );

      orders.sort((a, b) => {
        const tb = Number(b.ts) || 0;
        const ta = Number(a.ts) || 0;
        if (tb !== ta) return tb - ta; // latest first
        return String(b.time || '').localeCompare(String(a.time || ''));
      });
      res.json({ orders });
    },
  };
}
