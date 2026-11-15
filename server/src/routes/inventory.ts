import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../prisma';
import { config } from '../config';
import { requireAdmin } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils';
import { UNIT_STATUS } from '../constants';

const router = Router();

// Laptop images are stored in the database (LaptopModel.imageData), so the
// upload is buffered in memory rather than written to disk.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (!config.allowedImageMime.includes(file.mimetype)) {
      cb(new HttpError(400, 'Only PNG, JPEG, WEBP or GIF images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

const unitInput = z.object({
  laptopModelId: z.string(),
  serialNumber: z.string().optional(),
  assetNumber: z.string().optional(),
  condition: z.string().optional(),
  status: z.enum(UNIT_STATUS).default('AVAILABLE'),
  assignedResaleId: z.string().optional().nullable(),
  assignedUserId: z.string().optional().nullable(),
});

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status, laptopModelId } = req.query as Record<string, string>;
    const units = await prisma.laptopUnit.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(laptopModelId ? { laptopModelId } : {}),
      },
      include: { laptopModel: true, assignedUser: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(units);
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = unitInput.parse(req.body);
    const unit = await prisma.laptopUnit.create({ data });
    res.status(201).json(unit);
  })
);

// BULK add — add a quantity of units for a model. The model can be an existing
// catalog model (laptopModelId) or a free-text name typed by the admin, which
// is found-or-created automatically. Sent as multipart/form-data so an optional
// laptop image can be uploaded alongside the specs.
const bulkInput = z.object({
  laptopModelId: z.string().optional(),
  manufacturer: z.string().optional(),
  modelName: z.string().optional(),
  processor: z.string().optional(),
  memory: z.string().optional(),
  storage: z.string().optional(),
  condition: z.string().optional(),
  price: z.coerce.number().min(0).optional(),
  currency: z.string().optional(),
  quantity: z.coerce.number().int().min(1).max(1000),
});

router.post(
  '/bulk',
  requireAdmin,
  imageUpload.single('image'),
  asyncHandler(async (req, res) => {
    const data = bulkInput.parse(req.body);
    const hasImage = Boolean(req.file);
    const imageData = req.file?.buffer;
    const imageMimeType = req.file?.mimetype;
    const processor = data.processor?.trim() || undefined;
    const memory = data.memory?.trim() || undefined;
    const storage = data.storage?.trim() || undefined;
    const currency = data.currency?.trim() || undefined;

    let laptopModelId = data.laptopModelId;
    if (!laptopModelId) {
      const modelName = (data.modelName ?? '').trim();
      if (!modelName) throw new HttpError(400, 'Select a model or type a model name.');
      const manufacturer = (data.manufacturer ?? '').trim();
      const existing = await prisma.laptopModel.findFirst({
        where: { modelName, ...(manufacturer ? { manufacturer } : {}) },
      });
      const model =
        existing ??
        (await prisma.laptopModel.create({
          data: {
            manufacturer,
            modelName,
            condition: data.condition ?? 'Good',
            processor,
            memory,
            storage,
            ...(hasImage ? { imageData, imageMimeType } : {}),
            price: data.price ?? 0,
            ...(currency ? { currency } : {}),
          },
        }));
      laptopModelId = model.id;
    }

    // Update specs / image on the target model when new values were provided
    // (covers both existing catalog models and matched-by-name models).
    if (processor || memory || storage || hasImage || data.price !== undefined || currency) {
      await prisma.laptopModel.update({
        where: { id: laptopModelId },
        data: {
          ...(processor ? { processor } : {}),
          ...(memory ? { memory } : {}),
          ...(storage ? { storage } : {}),
          ...(hasImage
            ? {
                imageData,
                imageMimeType,
                imagePath: `/uploads/images/${laptopModelId}?v=${Date.now()}`,
              }
            : {}),
          ...(data.price !== undefined ? { price: data.price } : {}),
          ...(currency ? { currency } : {}),
        },
      });
    }

    await prisma.laptopUnit.createMany({
      data: Array.from({ length: data.quantity }, () => ({
        laptopModelId: laptopModelId!,
        condition: data.condition,
        status: 'AVAILABLE',
      })),
    });

    res.status(201).json({ ok: true, added: data.quantity, laptopModelId });
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = unitInput.partial().parse(req.body);
    const unit = await prisma.laptopUnit.update({ where: { id: req.params.id }, data });
    res.json(unit);
  })
);

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const unit = await prisma.laptopUnit.findUnique({ where: { id: req.params.id } });
    if (!unit) throw new HttpError(404, 'Unit not found.');
    await prisma.laptopUnit.update({ where: { id: req.params.id }, data: { status: 'REMOVED' } });
    res.status(204).end();
  })
);

// DELETE an entire inventory line for a model — removes all AVAILABLE units for
// that model. Units that are assigned / handed over are left untouched.
router.delete(
  '/model/:laptopModelId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await prisma.laptopUnit.deleteMany({
      where: { laptopModelId: req.params.laptopModelId, status: 'AVAILABLE' },
    });
    res.json({ deleted: result.count });
  })
);

export default router;
