import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils';

const router = Router();

// Aggregated figures for the administration dashboard.
router.get(
  '/admin',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [
      resales,
      totalRegistrations,
      eligibleRegistrations,
      winnersAwaiting,
      pendingHandovers,
      completedHandovers,
      availableInventory,
      recentAudit,
    ] = await Promise.all([
      prisma.resale.findMany({ select: { id: true, title: true, status: true, registrationCloseAt: true, resaleAt: true, pickupEndAt: true } }),
      prisma.registration.count(),
      prisma.registration.count({
        where: { eligibilityStatus: { in: ['ELIGIBLE', 'OVERRIDDEN'] } },
      }),
      prisma.winnerAssignment.count({ where: { status: 'PENDING' } }),
      prisma.registration.count({ where: { status: 'WINNER' } }),
      prisma.handoverRecord.count({ where: { completedAt: { not: null } } }),
      prisma.laptopUnit.count({ where: { status: 'AVAILABLE' } }),
      prisma.auditLog.findMany({
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const byStatus = (s: string) => resales.filter((l) => l.status === s).length;
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    res.json({
      activeResales: byStatus('OPEN'),
      draftResales: byStatus('DRAFT'),
      scheduledResales: byStatus('SCHEDULED'),
      registrationsOpen: resales.filter((l) => l.status === 'OPEN').length,
      totalRegistrations,
      eligibleRegistrations,
      pendingResales: resales.filter((l) => l.status === 'CLOSED').length,
      pendingPublication: byStatus('RESULTS_PENDING'),
      winnersAwaiting,
      pendingHandovers,
      completedHandovers,
      availableInventory,
      upcomingClosings: resales.filter(
        (l) => l.status === 'OPEN' && l.registrationCloseAt <= soon && l.registrationCloseAt >= now
      ),
      resaleStatuses: [...resales].sort(
        (a, b) => new Date(b.registrationCloseAt).getTime() - new Date(a.registrationCloseAt).getTime()
      ),
      recentActivity: recentAudit,
    });
  })
);

export default router;
