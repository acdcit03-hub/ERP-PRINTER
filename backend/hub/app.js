import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createAuthMiddleware } from '../shared/utils/auth.js';
import createHubRouter from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function corsMiddleware(req, res, next) {
  const configured = String(process.env.ERP_CORS_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (!origin || configured.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else if (configured.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Filename'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
}

export default function createHubApp({ config, controllers }) {
  const app = express();
  const frontendDir = path.join(__dirname, '..', '..', 'frontend');

  app.disable('x-powered-by');
  app.use(corsMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(frontendDir));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, role: 'hub' });
  });

  app.get('/', (_req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
  });

  app.use('/api', createAuthMiddleware(config.pin), createHubRouter(controllers));

  app.use((err, _req, res, _next) => {
    console.error('Hub error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File exceeds 200 MiB limit' });
    }
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}
