import { createApp } from './app';
import { config } from './config';
import { prisma } from './prisma';
import { startResaleScheduler } from './services/scheduler';

const app = createApp();

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Laptop Resale API listening on http://localhost:${config.port}`);
});

// Automatically opens scheduled resales and closes resales whose registration
// window has ended, so admins don't have to publish/close by hand.
const stopScheduler = startResaleScheduler();

async function shutdown() {
  stopScheduler();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
