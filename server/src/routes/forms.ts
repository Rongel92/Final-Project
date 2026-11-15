import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../prisma';
import { config } from '../config';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils';
import { recordAudit } from '../services/audit';
import { FORM_TYPES } from '../constants';

const router = Router();

// Files are stored in the database (UploadedForm.fileData), so the upload is
// buffered in memory rather than written to disk. This keeps forms available
// across every app instance without a shared volume.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (!config.allowedUploadMime.includes(file.mimetype)) {
      cb(new HttpError(400, 'Only PDF and DOCX files are allowed.'));
      return;
    }
    cb(null, true);
  },
});

// Metadata columns to return for list/create responses. Excludes the fileData
// blob so listing forms never ships the file bytes over the wire.
const formMetaSelect = {
  id: true,
  resaleId: true,
  formType: true,
  originalFilename: true,
  mimeType: true,
  fileSize: true,
  version: true,
  isActive: true,
  uploadedBy: true,
  uploadedAt: true,
} as const;

// List forms for a resale (optionally include full version history).
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { resaleId, includeHistory, global } = req.query as Record<string, string>;
    const forms = await prisma.uploadedForm.findMany({
      where: {
        ...(global === 'true' ? { resaleId: null } : resaleId ? { resaleId } : {}),
        ...(includeHistory === 'true' ? {} : { isActive: true }),
      },
      orderBy: [{ formType: 'asc' }, { version: 'desc' }],
      select: formMetaSelect,
    });
    res.json(forms);
  })
);

// Upload / replace a form. Uploading a new form of the same type for the same
// resale deactivates prior versions and increments the version number.
router.post(
  '/',
  requireAdmin,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'A file is required.');
    const { resaleId, formType } = z
      .object({ resaleId: z.string().optional(), formType: z.enum(FORM_TYPES) })
      .parse(req.body);

    const prior = await prisma.uploadedForm.findFirst({
      where: { resaleId: resaleId ?? null, formType, isActive: true },
      orderBy: { version: 'desc' },
    });
    const isReplacement = Boolean(prior);

    if (prior) {
      await prisma.uploadedForm.update({ where: { id: prior.id }, data: { isActive: false } });
    }

    const form = await prisma.uploadedForm.create({
      data: {
        resaleId: resaleId ?? null,
        formType,
        originalFilename: req.file.originalname,
        fileData: req.file.buffer,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        version: (prior?.version ?? 0) + 1,
        isActive: true,
        uploadedBy: req.user!.id,
      },
      select: formMetaSelect,
    });

    await recordAudit({
      userId: req.user!.id,
      role: 'ADMIN',
      action: isReplacement ? 'FORM_REPLACED' : 'FORM_UPLOADED',
      entityType: 'UploadedForm',
      entityId: form.id,
      newValue: { formType, version: form.version, filename: form.originalFilename },
    });

    res.status(201).json(form);
  })
);

// Download a stored form (streamed from the database).
router.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const form = await prisma.uploadedForm.findUnique({
      where: { id: req.params.id },
      select: { originalFilename: true, mimeType: true, fileData: true },
    });
    if (!form) throw new HttpError(404, 'Form not found.');
    const body = Buffer.from(form.fileData);
    res.setHeader('Content-Type', form.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(form.originalFilename)}"`
    );
    res.setHeader('Content-Length', body.length);
    res.send(body);
  })
);

// Delete a stored form version. The active version cannot be deleted (replace it
// with a new upload instead).
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const form = await prisma.uploadedForm.findUnique({
      where: { id: req.params.id },
      select: formMetaSelect,
    });
    if (!form) throw new HttpError(404, 'Form not found.');
    if (form.isActive) {
      throw new HttpError(400, 'The active version cannot be deleted. Upload a replacement instead.');
    }

    await prisma.uploadedForm.delete({ where: { id: form.id } });

    await recordAudit({
      userId: req.user!.id,
      role: 'ADMIN',
      action: 'FORM_DELETED',
      entityType: 'UploadedForm',
      entityId: form.id,
      previousValue: { formType: form.formType, version: form.version, filename: form.originalFilename },
    });

    res.status(204).end();
  })
);

export default router;
