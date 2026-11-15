import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils';
import { publishResults } from '../services/resale';
import { changeWinnerAssignmentStatus } from '../services/results';
import { WINNER_ASSIGNMENT_STATUS } from '../constants';

const router = Router();

// Results for a resale. Admins can review before publication; employees only
// ever receive published results and only their own row is emphasized.
router.get(
  '/:resaleId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resale = await prisma.resale.findUnique({ where: { id: req.params.resaleId } });
    if (!resale) throw new HttpError(404, 'Resale not found.');
    const isAdmin = req.user!.role === 'ADMIN';

    if (!isAdmin && resale.status !== 'RESULTS_PUBLISHED' && resale.status !== 'PICKUP' && resale.status !== 'COMPLETED') {
      throw new HttpError(403, 'Results have not been published yet.');
    }

    const results = await prisma.resaleResult.findMany({
      where: { resaleId: req.params.resaleId },
      include: {
        registration: { include: { user: true, handover: true } },
        laptopModel: true,
        assignment: true,
      },
      orderBy: [{ resultType: 'asc' }, { resultOrder: 'asc' }],
    });

    if (isAdmin) return res.json({ resale, results });

    // Employee: return a compact view + their personal result.
    const mine = results.filter((r) => r.registration.userId === req.user!.id);
    return res.json({
      resale,
      myResults: mine,
      counts: {
        winners: results.filter((r) => r.resultType === 'WINNER').length,
        waitingList: results.filter((r) => r.resultType === 'WAITING_LIST').length,
      },
    });
  })
);

// Publish results (admin review -> publish).
router.post(
  '/:resaleId/publish',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await publishResults(req.params.resaleId, req.user!.id);
    res.json({ ok: true });
  })
);

// Change a winner assignment status (accepted / declined / etc.).
router.post(
  '/assignment/:id/status',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status, reason } = z
      .object({ status: z.enum(WINNER_ASSIGNMENT_STATUS), reason: z.string().optional() })
      .parse(req.body);

    const updated = await changeWinnerAssignmentStatus(req.params.id, status, req.user!.id, reason);
    res.json(updated);
  })
);

export default router;
