export default function createPeerController(peerStore) {
  return {
    add(req, res) {
      try {
        const { address, name, pin } = req.body || {};
        if (!address) {
          return res.status(400).json({ error: 'address is required' });
        }
        const peer = peerStore.add({ address, name, pin });
        return res.json({ success: true, peer });
      } catch (err) {
        if (err.code === 'DUPLICATE') {
          return res.status(409).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message || 'Failed to add peer' });
      }
    },

    remove(req, res) {
      const id = String(req.query.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'id query parameter is required' });
      }
      const ok = peerStore.remove(id);
      if (!ok) {
        return res.status(404).json({ error: 'Peer not found' });
      }
      return res.json({ success: true });
    },
  };
}
