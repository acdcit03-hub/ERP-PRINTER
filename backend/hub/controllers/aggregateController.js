import * as proxyService from '../services/proxyService.js';

export default function createAggregateController(peerStore, relay, jobQueue) {
  return {
    async all(req, res) {
      const peers = peerStore.list();
      const hosts = [];
      const printers = [];

      await Promise.all(
        peers.map(async (peer) => {
          // Cloud relay: Agent dials out — use last heartbeat (works on Render)
          if (relay?.isOnline(peer.id)) {
            const agent = relay.get(peer.id);
            hosts.push({
              id: peer.id,
              name: agent.name || peer.name,
              address: agent.address || peer.address,
              url: agent.url || peer.url,
              online: true,
              mode: 'relay',
              info: agent.info,
              error: agent.info?.error || null,
            });
            for (const p of agent.printers || []) {
              printers.push({
                ...p,
                host: peer.id,
                hostName: agent.name || peer.name,
              });
            }
            return;
          }

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
                error: 'Agent unreachable — start Agent with PRINT_HUB_URL pointing at this Hub',
              });
              return;
            }

            hosts.push({
              id: peer.id,
              name: peer.name,
              address: peer.address,
              url: peer.url,
              online: true,
              mode: 'direct',
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

      // Orders reported back through relay job completion (kept on agent;
      // also merge any completed relay job orders still in memory)
      if (jobQueue) {
        for (const job of jobQueue.jobs.values()) {
          if (job.result?.order) {
            const peer = peerStore.findById(job.peerId);
            orders.push({
              ...job.result.order,
              host: peer?.name || job.peerId,
              hostId: job.peerId,
            });
          }
        }
      }

      await Promise.all(
        peers.map(async (peer) => {
          if (relay?.isOnline(peer.id)) {
            // Orders live on the Agent; relay path returns them via job.result.
            // Direct fetch from LAN Agent will fail on Render — skip.
            return;
          }
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
        if (tb !== ta) return tb - ta;
        return String(b.time || '').localeCompare(String(a.time || ''));
      });
      res.json({ orders });
    },
  };
}
