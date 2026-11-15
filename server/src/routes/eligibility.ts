import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils';
import { evaluateEligibility } from '../services/eligibility';
import { recordAudit } from '../services/audit';

const router = Router();

// Check the current user's eligibility for a resale (used by the wizard).
router.get(
  '/check/:resaleId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resale = await prisma.resale.findUnique({ where: { id: req.params.resaleId } });
    if (!resale) throw new HttpError(404, 'Resale not found.');
    const result = await evaluateEligibility(req.user!.id, resale);
    res.json(result);
  })
);

// The current user's global eligibility (cooldown) status, independent of any
// specific resale. Used by the dashboard to hide resales and show an ineligibility
// notice for users who recently received a laptop.
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const now = new Date();
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

    // Administrator manual override takes precedence over automatic cooldown.
    if (user?.manualEligibility === 'INELIGIBLE') {
      res.json({
        eligible: false,
        nextEligibleAt: null,
        reason: 'An administrator has marked you as not eligible to participate.',
      });
      return;
    }
    if (user?.manualEligibility === 'ELIGIBLE') {
      res.json({ eligible: true, nextEligibleAt: null, reason: 'Eligible to participate.' });
      return;
    }

    const restrictive = await prisma.participationHistory.findFirst({
      where: { userId: req.user!.id, nextEligibleAt: { gt: now } },
      orderBy: { nextEligibleAt: 'desc' },
    });
    if (restrictive?.nextEligibleAt) {
      res.json({
        eligible: false,
        nextEligibleAt: restrictive.nextEligibleAt,
        reason: `You previously received a laptop and are not eligible until ${restrictive.nextEligibleAt.toLocaleDateString()}.`,
      });
      return;
    }
    res.json({ eligible: true, nextEligibleAt: null, reason: 'Eligible to participate.' });
  })
);

// --- Administrator manual eligibility overrides -----------------------------

// List all manual eligibility overrides currently in effect.
router.get(
  '/admin/overrides',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { manualEligibility: { not: null } },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        department: true,
        manualEligibility: true,
        eligibilityNote: true,
        updatedAt: true,
      },
    });
    res.json(users);
  })
);

// Set (or clear) a manual eligibility override for a user, looked up by email.
const overrideInput = z.object({
  email: z.string().email(),
  status: z.enum(['ELIGIBLE', 'INELIGIBLE']).nullable(),
  note: z.string().max(500).optional(),
});
router.post(
  '/admin/overrides',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = overrideInput.parse(req.body);
    const email = parsed.email.trim().toLowerCase();
    const status = parsed.status;
    const note = parsed.note?.trim() ?? '';

    // SQLite has no case-insensitive filter, so match in memory.
    const candidates = await prisma.user.findMany();
    const user = candidates.find((u) => u.email.trim().toLowerCase() === email);
    if (!user) throw new HttpError(404, 'No user was found with that email address.');

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        manualEligibility: status,
        eligibilityNote: status === null ? null : note || null,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        department: true,
        manualEligibility: true,
        eligibilityNote: true,
        updatedAt: true,
      },
    });

    await recordAudit({
      userId: req.user!.id,
      role: 'ADMIN',
      action: status === null ? 'ELIGIBILITY_OVERRIDE_CLEARED' : 'ELIGIBILITY_OVERRIDE_SET',
      entityType: 'User',
      entityId: user.id,
      previousValue: { manualEligibility: user.manualEligibility },
      newValue: { manualEligibility: status, note: note || null, fullName: user.fullName },
    });

    res.json(updated);
  })
);

export default router;
