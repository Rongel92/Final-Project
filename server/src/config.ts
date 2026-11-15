import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // PostgreSQL connection string (also read directly by Prisma). Used by the
  // session store (connect-pg-simple) to share sessions across app instances.
  databaseUrl: (process.env.DATABASE_URL ?? '').trim(),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // When set, Express serves the built client SPA from this dir (single-origin
  // container). Left undefined in local dev where Vite serves the client.
  clientDistDir: process.env.CLIENT_DIST_DIR
    ? path.resolve(process.env.CLIENT_DIST_DIR)
    : undefined,
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),
  allowedUploadMime: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ] as string[],
  allowedImageMime: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as string[],
  // Mailbox that resale decline appeals are sent to. Wire real delivery in the
  // email service; this is the destination address for the appeal pipeline.
  appealMailbox: process.env.APPEAL_MAILBOX ?? 'resale-appeals@company.local',
  // Contact address employees are told to reach for cancellation appeals /
  // questions. Set MANAGEMENT_MAILBOX to the real management team address.
  managementMailbox: process.env.MANAGEMENT_MAILBOX ?? 'resale-management@company.local',
  // Base URL of the employee-facing app, used to build links inside emails.
  appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  // Email delivery. transport 'graph' sends via Microsoft Graph app-only using an
  // Entra app registration's tenant/client/secret; anything else logs to the console.
  email: {
    transport: (process.env.EMAIL_TRANSPORT ?? 'log').trim().toLowerCase(),
    from: (process.env.EMAIL_FROM ?? 'laptop-resale@company.local').trim(),
    graph: {
      tenantId: (process.env.ENTRA_TENANT_ID ?? '').trim(),
      clientId: (process.env.ENTRA_CLIENT_ID ?? '').trim(),
      clientSecret: (process.env.ENTRA_CLIENT_SECRET ?? '').trim(),
    },
  },
  session: {
    secret: process.env.SESSION_SECRET ?? 'dev-insecure-session-secret-change-me',
    // Session data is stored in PostgreSQL (see connect-pg-simple in app.ts),
    // so no local directory is required.
    storeDir: path.resolve(process.cwd(), process.env.SESSION_STORE_DIR ?? '.'),
    // Send the cookie only over HTTPS in production (set behind TLS/reverse proxy).
    cookieSecure:
      (process.env.COOKIE_SECURE ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) ===
      'true',
    // Enable when running behind a reverse proxy so secure cookies work.
    trustProxy: (process.env.TRUST_PROXY ?? 'false') === 'true',
  },
};
