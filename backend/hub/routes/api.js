import express from 'express';
import multer from 'multer';
import path from 'path';
import { uploadDir, MAX_FILE_SIZE } from '../../shared/utils/files.js';

export default function createHubRouter(controllers) {
  const router = express.Router();
  const { peers, aggregate, scan, proxy, relay } = controllers;

  const uploads = uploadDir('printer_hub_uploads');
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploads),
    filename: (_req, file, cb) => {
      const safe = path.basename(file.originalname || 'document.bin').replace(/[^\w.\-()+ ]+/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  });

  router.get('/all', (req, res) => aggregate.all(req, res));
  router.get('/all_orders', (req, res) => aggregate.allOrders(req, res));
  router.get('/scan', (req, res) => scan.scan(req, res));

  router.post('/peers/add', peers.add);
  router.post('/peers/remove', peers.remove);

  // Agent → Hub relay (office PC dials out to Render)
  router.post('/agent/heartbeat', (req, res) => relay.heartbeat(req, res));
  router.get('/agent/jobs/next', (req, res) => relay.nextJob(req, res));
  router.get('/agent/jobs/:jobId/file', (req, res) => relay.downloadJob(req, res));
  router.post('/agent/jobs/:jobId/complete', (req, res) => relay.completeJob(req, res));

  router.get('/options', (req, res) => proxy.options(req, res));
  router.get('/jobs', (req, res) => proxy.jobs(req, res));
  router.get('/orders', (req, res) => proxy.orders(req, res));
  router.post('/cancel', (req, res) => proxy.cancel(req, res));

  router.post(
    '/print',
    (req, res, next) => {
      const ct = String(req.headers['content-type'] || '');
      if (ct.includes('multipart/form-data')) {
        return upload.single('file')(req, res, next);
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        req.body = Buffer.concat(chunks);
        next();
      });
      req.on('error', next);
    },
    (req, res) => proxy.print(req, res)
  );

  return router;
}
