import { listJobs, cancelJob } from '../services/queueService.js';

export default function createJobController(printerCache) {
  return {
    async listJobs(req, res) {
      const printer = String(req.query.printer || '').trim();
      if (!printer) {
        return res.status(400).json({ error: 'printer query parameter is required' });
      }

      if (!printerCache.findByName(printer)) {
        return res.status(404).json({ error: `Printer not found: ${printer}` });
      }

      try {
        const jobs = await listJobs(printer);
        return res.json({ printer, jobs });
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to read queue' });
      }
    },

    async cancel(req, res) {
      const printer = String(req.query.printer || '').trim();
      const id = String(req.query.id || '').trim();

      if (!printer || !id) {
        return res.status(400).json({ error: 'printer and id query parameters are required' });
      }

      if (!/^\d+$/.test(id) && !/^[\w.-]+-\d+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid job id' });
      }

      if (!printerCache.findByName(printer)) {
        return res.status(404).json({ error: `Printer not found: ${printer}` });
      }

      try {
        const result = await cancelJob(printer, id);
        return res.json(result);
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to cancel job' });
      }
    },
  };
}
