import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils';

const router = Router();

const modelInput = z.object({
  manufacturer: z.string().min(1),
  modelName: z.string().min(1),
  processor: z.string().optional(),
  memory: z.string().optional(),
  storage: z.string().optional(),
  screenSize: z.string().optional(),
  operatingSystem: z.string().optional(),
  condition: z.string().default('Good'),
  batteryCondition: z.string().optional(),
  accessories: z.string().optional(),
  description: z.string().optional(),
  imagePath: z.string().optional(),
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const models = await prisma.laptopModel.findMany({ orderBy: { manufacturer: 'asc' } });
    res.json(models);
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const model = await prisma.laptopModel.findUnique({
      where: { id: req.params.id },
      include: { units: true },
    });
    if (!model) throw new HttpError(404, 'Laptop model not found.');
    res.json(model);
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = modelInput.parse(req.body);
    const model = await prisma.laptopModel.create({ data });
    res.status(201).json(model);
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = modelInput.partial().parse(req.body);
    const model = await prisma.laptopModel.update({ where: { id: req.params.id }, data });
    res.json(model);
  })
);

export default router;
