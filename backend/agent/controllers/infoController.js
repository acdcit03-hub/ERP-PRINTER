import { sumatraAvailable } from '../services/printService.js';

export default function createInfoController(config) {
  return {
    getInfo(req, res) {
      res.json({
        agent: 'printer-live',
        version: '1.0.0',
        os: process.platform,
        name: config.name,
        sumatra: process.platform === 'win32' ? sumatraAvailable(config.sumatraPath) : false,
        pinRequired: Boolean(config.pin),
      });
    },

    live(req, res) {
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.flushHeaders?.();

      const send = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      send('hello', { name: config.name, ts: Date.now() });
      const timer = setInterval(() => {
        send('heartbeat', { ts: Date.now() });
      }, 5000);

      req.on('close', () => {
        clearInterval(timer);
      });
    },
  };
}
