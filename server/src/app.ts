import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { config } from './config';
import { prisma } from './prisma';
import { attachUser } from './middleware/auth';
import { errorHandler, notFound } from './middleware/error';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import resaleRoutes from './routes/resales';
import laptopModelRoutes from './routes/laptopModels';
import inventoryRoutes from './routes/inventory';
import registrationRoutes from './routes/registrations';
import eligibilityRoutes from './routes/eligibility';
import resaleRunRoutes from './routes/resaleRuns';
import resultRoutes from './routes/results';
import notificationRoutes from './routes/notifications';
import formRoutes from './routes/forms';
import handoverRoutes from './routes/handovers';
import exportRoutes from './routes/exports';
import auditRoutes from './routes/auditLogs';
import statsRoutes from './routes/stats';

export function createApp() {
  const app = express();

  // Behind a reverse proxy (container/prod), trust it so secure cookies work.
  if (config.session.trustProxy) app.set('trust proxy', 1);

  // Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, etc.).
  // The API and the SPA are served from different origins, and laptop images
  // are fetched cross-origin, so allow cross-origin resource loading.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin: config.clientOrigins,
      credentials: true,
      allowedHeaders: ['Content-Type'],
    })
  );
  app.use(express.json({ limit: '2mb' }));

  // Session cookie carries the id of the user chosen on the sign-in page.
  // Sessions are persisted to PostgreSQL so logins survive restarts and are
  // shared across every app instance.
  const PgStore = connectPgSimple(session);
  const sessionPool = new Pool({ connectionString: config.databaseUrl });
  app.use(
    session({
      name: 'resale.sid',
      store: new PgStore({ pool: sessionPool, createTableIfMissing: true }),
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.session.cookieSecure,
        maxAge: 1000 * 60 * 60 * 8,
      },
    })
  );
  app.use(attachUser);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Publicly serve laptop model images straight from the database (by model id).
  app.get('/uploads/images/:id', async (req, res) => {
    try {
      const model = await prisma.laptopModel.findUnique({
        where: { id: req.params.id },
        select: { imageData: true, imageMimeType: true },
      });
      if (!model?.imageData) {
        res.status(404).end();
        return;
      }
      res.setHeader('Content-Type', model.imageMimeType ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(Buffer.from(model.imageData));
    } catch {
      res.status(404).end();
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/resales', resaleRoutes);
  app.use('/api/laptop-models', laptopModelRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/registrations', registrationRoutes);
  app.use('/api/eligibility', eligibilityRoutes);
  app.use('/api/resale-runs', resaleRunRoutes);
  app.use('/api/results', resultRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/forms', formRoutes);
  app.use('/api/handovers', handoverRoutes);
  app.use('/api/exports', exportRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/stats', statsRoutes);

  // Single-origin production: serve the built SPA and fall back to index.html
  // for client-side routes (anything that isn't an /api or /uploads path).
  if (config.clientDistDir && fs.existsSync(config.clientDistDir)) {
    const indexHtml = path.join(config.clientDistDir, 'index.html');
    app.use(express.static(config.clientDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.sendFile(indexHtml);
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
