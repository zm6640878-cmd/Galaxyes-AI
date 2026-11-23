import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { getMarketplaceCatalog } from './server/catalog.ts';
import { db, initDb } from './server/db.ts';
import { GLAXYES_MODELS } from './server/gemini.ts';
import adminRoutes from './server/routes/admin.ts';
import authRoutes from './server/routes/auth.ts';
import keyRoutes from './server/routes/keys.ts';
import usageRoutes from './server/routes/usage.ts';
import v1Routes from './server/routes/v1.ts';

initDb();

const app = express();
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '15mb' }));

app.get(['/healthz', '/api/health'], (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({
      status: 'ok',
      service: 'glaxyes-ai',
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
      ),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      error: err instanceof Error ? err.message : 'Database check failed',
    });
  }
});

app.get('/api/models', (_req, res) => {
  res.json({
    models: GLAXYES_MODELS.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      description: m.description,
      contextWindow: m.contextWindow,
      aliases: m.aliases,
      tier: m.tier,
    })),
  });
});

app.get('/api/marketplace', (req, res) => {
  const host = req.get('host');
  const proto = req.protocol || 'https';
  const origin = host ? `${proto}://${host}` : '';
  res.json({
    apis: getMarketplaceCatalog(origin),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/v1', v1Routes);

// Return JSON 404 for unknown /api or /v1 endpoints
app.use(['/api', '/v1'], (_req, res) => {
  res.status(404).json({
    error: {
      message: 'API endpoint not found.',
      type: 'invalid_request_error',
      code: 'not_found',
    },
  });
});

const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtml = path.join(distDir, 'index.html');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(500).send('Production build not found. Run npm run build first.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Glaxyes AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Glaxyes AI server:', err);
  process.exit(1);
});
