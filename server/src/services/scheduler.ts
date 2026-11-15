import { prisma } from '../prisma';
import { recordAudit } from './audit';
import { runResale } from './resale';

// Advances resales through their time-based registration lifecycle without admin
// intervention:
//   SCHEDULED -> OPEN    once the registration window starts
//   OPEN      -> CLOSED  once the registration window ends
//   CLOSED    -> run     once the expected resale time arrives
// Completion of the resale after results is fully manual — an administrator
// closes it once every winner's handover has been completed or declined.
async function runResaleLifecycleTick() {
  const now = new Date();

  const toOpen = await prisma.resale.findMany({
    where: { status: 'SCHEDULED', registrationOpenAt: { lte: now } },
    select: { id: true, publishedAt: true },
  });
  for (const d of toOpen) {
    await prisma.resale.update({
      where: { id: d.id },
      data: { status: 'OPEN', publishedAt: d.publishedAt ?? now },
    });
    await recordAudit({
      userId: null,
      role: 'SYSTEM',
      action: 'RESALE_OPENED',
      entityType: 'Resale',
      entityId: d.id,
      previousValue: { status: 'SCHEDULED' },
      newValue: { status: 'OPEN' },
      reason: 'Registration window started automatically.',
    });
  }

  const toClose = await prisma.resale.findMany({
    where: { status: 'OPEN', registrationCloseAt: { lte: now } },
    select: { id: true },
  });
  for (const d of toClose) {
    await prisma.resale.update({
      where: { id: d.id },
      data: { status: 'CLOSED', closedAt: now },
    });
    await recordAudit({
      userId: null,
      role: 'SYSTEM',
      action: 'RESALE_CLOSED',
      entityType: 'Resale',
      entityId: d.id,
      previousValue: { status: 'OPEN' },
      newValue: { status: 'CLOSED' },
      reason: 'Registration window ended automatically.',
    });
  }

  // Run the resale automatically once its expected resale time has arrived.
  const toResale = await prisma.resale.findMany({
    where: { status: 'CLOSED', resaleAt: { lte: now } },
    select: { id: true },
  });
  for (const d of toResale) {
    try {
      await runResale(d.id, null);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Automatic resale failed for ${d.id}`, e);
    }
  }
}

// Starts the periodic scheduler and returns a stop function.
export function startResaleScheduler(intervalMs = 60_000) {
  const tick = () => {
    runResaleLifecycleTick().catch((e) => {
      // eslint-disable-next-line no-console
      console.error('Resale scheduler error', e);
    });
  };
  tick(); // run once immediately at startup
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
