import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { csrfGuard, loadUser, me, requireAuth } from './lib/auth';
import { errorHandler, notFound } from './lib/http';
import { attachStream } from './realtime';
import { accountRoutes } from './routes/account';
import { adminRoutes } from './routes/admin';
import { announcementRoutes } from './routes/announcements';
import { catalogRoutes } from './routes/catalog';
import { messageRoutes } from './routes/messages';
import { orderRoutes } from './routes/orders';
import { publicRoutes } from './routes/public';
import { staffRoutes } from './routes/staff';
import { webhookRoutes } from './routes/webhooks';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.isProd && config.appUrl.startsWith('https') ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression({ filter: (req, res) => (req.path === '/api/stream' ? false : compression.filter(req, res)) }));

  const api = express.Router();
  api.use(webhookRoutes);
  api.use(express.json({ limit: '1mb' }));
  api.use(loadUser);
  api.use(csrfGuard);
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.get('/stream', requireAuth, (req, res) => attachStream(req, res, me(req).id));
  api.use(publicRoutes);
  api.use(accountRoutes);
  api.use(orderRoutes);
  api.use(catalogRoutes);
  api.use(messageRoutes);
  api.use(announcementRoutes);
  api.use(staffRoutes);
  api.use(adminRoutes);
  api.use(() => {
    throw notFound('Unknown API route.');
  });
  app.use('/api', api);

  // Serve the built web app (single deployable unit).
  const dist = config.webDist;
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders: (res, file) => {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
