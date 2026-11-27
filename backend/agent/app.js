import express from 'express';
import { createAuthMiddleware } from '../shared/utils/auth.js';
import createAgentRouter from './routes/api.js';

export default function createAgentApp({ config, controllers }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, role: 'agent', name: config.name });
  });

  app.use('/api', createAuthMiddleware(config.pin), createAgentRouter(controllers));

  app.use((err, _req, res, _next) => {
    console.error('Agent error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}
