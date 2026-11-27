import express from 'express';

export default function createAgentRouter(controllers) {
  const router = express.Router();
  const { info, printers, jobs, print, orders } = controllers;

  router.get('/info', info.getInfo);
  router.get('/live', info.live);
  router.get('/printers', printers.list);
  router.get('/options', printers.options);
  router.get('/jobs', (req, res) => jobs.listJobs(req, res));
  router.post('/cancel', (req, res) => jobs.cancel(req, res));
  router.post('/print', (req, res) => print.print(req, res));
  router.get('/orders', orders.list);

  return router;
}
