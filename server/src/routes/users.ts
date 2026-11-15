import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils';

const router = Router();

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { fullName: 'asc' } });
    res.json(users);
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new HttpError(404, 'User not found.');
    res.json(user);
  })
);

// Participation history for an employee (self or admin).
router.get(
  '/:id/participation',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN' && req.user!.id !== req.params.id) {
      throw new HttpError(403, 'You may only view your own participation history.');
    }
    const history = await prisma.participationHistory.findMany({
      where: { userId: req.params.id },
      include: { resale: true },
      orderBy: { participationDate: 'desc' },
    });
    res.json(history);
  })
);

export default router;
