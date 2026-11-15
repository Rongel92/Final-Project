import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils';
import { computePreResaleStats, runResale } from '../services/resale';

const router = Router();

router.get(
  '/:resaleId/pre-resale',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await computePreResaleStats(req.params.resaleId));
  })
);

router.post(
  '/:resaleId/run',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await runResale(req.params.resaleId, req.user!.id);
    res.status(201).json(result);
  })
);

export default router;
