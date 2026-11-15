import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { asyncHandler, getClientIp, HttpError } from '../utils';
import { evaluateEligibility } from '../services/eligibility';
import { recordAudit } from '../services/audit';
import { notify } from '../services/notifications';
import {
  sendRegistrationConfirmationEmail,
  sendRegistrationCancellationEmail,
} from '../services/emails';
import { TERMS_VERSION } from '../constants';

const router = Router();

const submitInput = z.object({
  resaleId: z.string(),
  selectedLaptopModelIds: z.array(z.string()).min(1),
  typedFullName: z.string().min(2),
  multiChoiceAck: z.boolean().optional().default(false),
});

// EMPLOYEE — my registrations
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const regs = await prisma.registration.findMany({
      where: { userId: req.user!.id },
      include: {
        resale: true,
        declarations: true,
        results: true,
        handover: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(regs);
  })
);

// EMPLOYEE — resales the user participated in, with decline details (stage,
// reason, who) surfaced only for entries that were declined by an administrator.
router.get(
  '/mine/participated',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const regs = await prisma.registration.findMany({
      where: { userId },
      include: {
        resale: true,
        handover: { include: { administrator: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Cancellations store their reason/actor in the audit log, not on the row.
    const cancelledIds = regs.filter((r) => r.status === 'CANCELLED').map((r) => r.id);
    const cancelAudits = cancelledIds.length
      ? await prisma.auditLog.findMany({
          where: {
            entityType: 'Registration',
            entityId: { in: cancelledIds },
            action: 'REGISTRATION_CANCELLED',
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const actorIds = [
      ...new Set(cancelAudits.map((a) => a.userId).filter((id): id is string => Boolean(id))),
    ];
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const actorName = (id?: string | null) => actors.find((u) => u.id === id)?.fullName ?? null;

    const items = regs.map((r) => {
      let declined: { stage: string; reason: string | null; byName: string | null } | null = null;
      const h = r.handover;
      if (h?.declinedAt && h.administratorId) {
        declined = {
          stage: 'Handover / pickup',
          reason: h.declineReason ?? null,
          byName: h.administrator?.fullName ?? null,
        };
      } else if (r.status === 'CANCELLED') {
        // Only an admin cancelling on the employee's behalf counts as a decline.
        const audit = cancelAudits.find((a) => a.entityId === r.id && a.userId && a.userId !== userId);
        if (audit) {
          declined = {
            stage: 'Registration',
            reason: audit.reason ?? null,
            byName: actorName(audit.userId),
          };
        }
      }
      return {
        registrationId: r.id,
        resaleTitle: r.resale.title,
        date: (r.submittedAt ?? r.createdAt).toISOString(),
        status: r.status,
        declined,
      };
    });

    res.json(items);
  })
);

// ADMIN — list with search / filters / pagination
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize ?? 25)));

    const where: any = {};
    if (q.resaleId) where.resaleId = q.resaleId;
    if (q.laptopModelId) {
      // Match any ranked choice; legacy rows only carry the single column.
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { modelChoices: { some: { laptopModelId: q.laptopModelId } } },
            { modelChoices: { none: {} }, selectedLaptopModelId: q.laptopModelId },
          ],
        },
      ];
    }
    if (q.status) where.status = q.status;
    if (q.eligibility) where.eligibilityStatus = q.eligibility;
    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) where.createdAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.createdAt.lte = new Date(q.dateTo);
    }
    if (q.search) {
      where.OR = [
        { user: { fullName: { contains: q.search } } },
        { user: { email: { contains: q.search } } },
      ];
    }
    if (q.department) where.user = { ...(where.user ?? {}), department: q.department };
    if (q.site) where.user = { ...(where.user ?? {}), site: q.site };

    const dir = q.dir === 'asc' ? 'asc' : 'desc';
    const sortMap: Record<string, any> = {
      employee: { user: { fullName: dir } },
      model: { selectedLaptopModelId: dir },
      eligibility: { eligibilityStatus: dir },
      status: { status: dir },
      date: { createdAt: dir },
    };
    const orderBy = sortMap[q.sort] ?? { createdAt: 'desc' };

    const [total, rows] = await Promise.all([
      prisma.registration.count({ where }),
      prisma.registration.findMany({
        where,
        include: {
          user: true,
          resale: true,
          handover: true,
          modelChoices: { orderBy: { priority: 'asc' } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const models = await prisma.laptopModel.findMany();
    const withModel = rows.map((r) => {
      const ids =
        r.modelChoices.length > 0
          ? r.modelChoices.map((c) => c.laptopModelId)
          : r.selectedLaptopModelId
            ? [r.selectedLaptopModelId]
            : [];
      return {
        ...r,
        selectedModel: models.find((m) => m.id === r.selectedLaptopModelId) ?? null,
        selectedModels: ids
          .map((id) => models.find((m) => m.id === id))
          .filter((m): m is (typeof models)[number] => Boolean(m)),
      };
    });
    res.json({ total, page, pageSize, rows: withModel });
  })
);

// DETAIL
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const reg = await prisma.registration.findUnique({
      where: { id: req.params.id },
      include: {
        user: true,
        resale: { include: { models: { include: { laptopModel: true } } } },
        modelChoices: { orderBy: { priority: 'asc' } },
        declarations: true,
        results: { include: { laptopModel: true } },
        handover: true,
      },
    });
    if (!reg) throw new HttpError(404, 'Registration not found.');
    if (req.user!.role !== 'ADMIN' && reg.userId !== req.user!.id) {
      throw new HttpError(403, 'Access denied.');
    }
    res.json(reg);
  })
);

// SUBMIT registration (employee)
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = submitInput.parse(req.body);
    const userId = req.user!.id;

    const resale = await prisma.resale.findUnique({
      where: { id: data.resaleId },
      include: { models: true },
    });
    if (!resale) throw new HttpError(404, 'Resale not found.');

    // Window checks.
    const now = new Date();
    if (resale.status !== 'OPEN') {
      throw new HttpError(400, 'This resale is not open for registration.');
    }
    if (now < resale.registrationOpenAt) {
      throw new HttpError(400, 'Registration has not opened yet.');
    }
    if (now > resale.registrationCloseAt) {
      throw new HttpError(400, 'Registration is closed for this resale.');
    }

    // Selected models must all belong to the resale (de-duplicated).
    const modelIds = [...new Set(data.selectedLaptopModelIds)];
    for (const modelId of modelIds) {
      const link = resale.models.find((m) => m.laptopModelId === modelId);
      if (!link) throw new HttpError(400, 'A selected model is not part of this resale.');
    }
    // When choosing more than one model, the multi-choice disclaimer must be acknowledged.
    if (modelIds.length > 1 && !data.multiChoiceAck) {
      throw new HttpError(400, 'Please acknowledge the multiple-selection disclaimer.');
    }

    // Duplicate prevention.
    const existing = await prisma.registration.findFirst({
      where: { resaleId: resale.id, userId, status: { notIn: ['CANCELLED'] } },
    });
    if (existing) throw new HttpError(409, 'You are already registered in this resale.');

    // A user may only be actively registered in a single resale at a time.
    // Registrations in a resale that has ended don't count.
    const activeElsewhere = await prisma.registration.findFirst({
      where: {
        userId,
        resaleId: { not: resale.id },
        status: { in: ['SUBMITTED', 'WINNER', 'WAITING_LIST'] },
        resale: { status: { notIn: ['COMPLETED', 'CANCELLED', 'ARCHIVED'] } },
      },
    });
    if (activeElsewhere) {
      throw new HttpError(
        409,
        'You can only be registered in a single resale at a time. Cancel your other registration first.'
      );
    }

    // Server-side eligibility.
    const eligibility = await evaluateEligibility(userId, resale);
    if (eligibility.status === 'INELIGIBLE') {
      throw new HttpError(403, eligibility.reason);
    }

    const reg = await prisma.$transaction(async (tx) => {
      const regData = {
        selectedLaptopModelId: modelIds[0],
        multiChoiceAck: modelIds.length > 1,
        status: 'SUBMITTED',
        eligibilityStatus: eligibility.status === 'REVIEW' ? 'REVIEW' : 'ELIGIBLE',
        eligibilityReason: eligibility.reason,
        termsAccepted: true,
        termsVersion: resale.termsVersion ?? TERMS_VERSION,
        typedFullName: data.typedFullName,
        ipAddress: getClientIp(req),
        userAgent: req.header('user-agent') ?? null,
        submittedAt: new Date(),
        cancelledAt: null,
      };
      // A prior cancelled registration still holds the unique (resaleId,userId)
      // slot, so reactivate it instead of inserting a duplicate.
      const prior = await tx.registration.findUnique({
        where: { resaleId_userId: { resaleId: resale.id, userId } },
      });
      let created;
      if (prior) {
        created = await tx.registration.update({ where: { id: prior.id }, data: regData });
        await tx.registrationModelChoice.deleteMany({ where: { registrationId: prior.id } });
      } else {
        created = await tx.registration.create({ data: { resaleId: resale.id, userId, ...regData } });
      }
      await tx.registrationModelChoice.createMany({
        data: modelIds.map((laptopModelId, index) => ({
          registrationId: created.id,
          laptopModelId,
          priority: index,
        })),
      });
      return created;
    });

    await recordAudit({
      userId,
      role: 'EMPLOYEE',
      action: 'REGISTRATION_SUBMITTED',
      entityType: 'Registration',
      entityId: reg.id,
      newValue: { resaleId: resale.id, selectedLaptopModelIds: modelIds },
    });

    await notify({
      userId,
      type: 'REGISTRATION_SUBMITTED',
      title: 'Registration confirmed',
      message: `Your registration for "${resale.title}" was received.`,
      resaleId: resale.id,
      registrationId: reg.id,
      actionUrl: `/my-registrations`,
    });

    const chosenModels = await prisma.laptopModel.findMany({ where: { id: { in: modelIds } } });
    const modelNames = modelIds.map((id) => {
      const m = chosenModels.find((cm) => cm.id === id);
      return m ? `${m.manufacturer} ${m.modelName}` : id;
    });
    await sendRegistrationConfirmationEmail({
      to: req.user!.email,
      fullName: req.user!.fullName,
      resaleTitle: resale.title,
      modelNames,
    });

    res.status(201).json(reg);
  })
);

// CANCEL (employee, if allowed)
router.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    const reg = await prisma.registration.findUnique({
      where: { id: req.params.id },
      include: { resale: true, user: true },
    });
    if (!reg) throw new HttpError(404, 'Registration not found.');
    if (req.user!.role !== 'ADMIN' && reg.userId !== req.user!.id) {
      throw new HttpError(403, 'Access denied.');
    }
    if (!reg.resale.allowCancellation && req.user!.role !== 'ADMIN') {
      throw new HttpError(400, 'Cancellation is not allowed for this resale.');
    }
    if (['WINNER', 'COMPLETED'].includes(reg.status)) {
      throw new HttpError(400, 'This registration can no longer be cancelled.');
    }
    const byAdmin = req.user!.role === 'ADMIN' && reg.userId !== req.user!.id;
    if (byAdmin && !reason?.trim()) {
      throw new HttpError(400, 'A reason is required when cancelling on behalf of an employee.');
    }
    const updated = await prisma.registration.update({
      where: { id: reg.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await recordAudit({
      userId: req.user!.id,
      role: req.user!.role,
      action: 'REGISTRATION_CANCELLED',
      entityType: 'Registration',
      entityId: reg.id,
      reason: reason?.trim() || undefined,
    });
    await notify({
      userId: reg.userId,
      type: 'REGISTRATION_CANCELLED',
      title: 'Registration cancelled',
      message: `Your registration for "${reg.resale.title}" has been cancelled.`,
      resaleId: reg.resaleId,
      registrationId: reg.id,
    });
    // Employees can re-register only while the resale is open and before close.
    const now = new Date();
    const canReregister = reg.resale.status === 'OPEN' && now < reg.resale.registrationCloseAt;
    await sendRegistrationCancellationEmail({
      to: reg.user.email,
      fullName: reg.user.fullName,
      resaleTitle: reg.resale.title,
      byAdmin,
      adminName: byAdmin ? req.user!.fullName : null,
      reason: reason?.trim() || null,
      reregisterUntil:
        !byAdmin && canReregister
          ? reg.resale.registrationCloseAt.toLocaleString('en-GB')
          : null,
    });
    res.json(updated);
  })
);

// CHANGE SELECTED MODEL(S) (employee, while the resale is still open)
const changeModelInput = z.object({
  selectedLaptopModelIds: z.array(z.string()).min(1),
  multiChoiceAck: z.boolean().optional().default(false),
});
router.patch(
  '/:id/model',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = changeModelInput.parse(req.body);
    const reg = await prisma.registration.findUnique({
      where: { id: req.params.id },
      include: { resale: { include: { models: true } }, modelChoices: true },
    });
    if (!reg) throw new HttpError(404, 'Registration not found.');
    if (req.user!.role !== 'ADMIN' && reg.userId !== req.user!.id) {
      throw new HttpError(403, 'Access denied.');
    }
    if (reg.status !== 'SUBMITTED') {
      throw new HttpError(400, 'This registration can no longer be changed.');
    }
    if (reg.resale.status !== 'OPEN') {
      throw new HttpError(400, 'The selection can only be changed while registration is open.');
    }
    if (new Date() > reg.resale.registrationCloseAt) {
      throw new HttpError(400, 'Registration is closed for this resale.');
    }
    const modelIds = [...new Set(data.selectedLaptopModelIds)];
    for (const modelId of modelIds) {
      const link = reg.resale.models.find((m) => m.laptopModelId === modelId);
      if (!link) throw new HttpError(400, 'A selected model is not part of this resale.');
    }
    if (modelIds.length > 1 && !data.multiChoiceAck) {
      throw new HttpError(400, 'Please acknowledge the multiple-selection disclaimer.');
    }

    const previousIds = reg.modelChoices.map((c) => c.laptopModelId);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.registrationModelChoice.deleteMany({ where: { registrationId: reg.id } });
      await tx.registrationModelChoice.createMany({
        data: modelIds.map((laptopModelId, index) => ({
          registrationId: reg.id,
          laptopModelId,
          priority: index,
        })),
      });
      return tx.registration.update({
        where: { id: reg.id },
        data: {
          selectedLaptopModelId: modelIds[0],
          multiChoiceAck: modelIds.length > 1,
        },
      });
    });
    await recordAudit({
      userId: req.user!.id,
      role: req.user!.role,
      action: 'REGISTRATION_UPDATED',
      entityType: 'Registration',
      entityId: reg.id,
      previousValue: { selectedLaptopModelIds: previousIds },
      newValue: { selectedLaptopModelIds: modelIds },
    });
    res.json(updated);
  })
);

// EXCLUDE (admin)
router.post(
  '/:id/exclude',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const reason = z.object({ reason: z.string().min(2) }).parse(req.body).reason;
    const reg = await prisma.registration.findUnique({ where: { id: req.params.id } });
    if (!reg) throw new HttpError(404, 'Registration not found.');
    const updated = await prisma.registration.update({
      where: { id: reg.id },
      data: { status: 'EXCLUDED', eligibilityReason: reason },
    });
    await recordAudit({
      userId: req.user!.id,
      role: 'ADMIN',
      action: 'REGISTRATION_EXCLUDED',
      entityType: 'Registration',
      entityId: reg.id,
      reason,
      previousValue: { status: reg.status },
      newValue: { status: 'EXCLUDED' },
    });
    res.json(updated);
  })
);

// ELIGIBILITY OVERRIDE (admin)
router.post(
  '/:id/override',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { reason, eligible } = z
      .object({ reason: z.string().min(2), eligible: z.boolean().default(true) })
      .parse(req.body);
    const reg = await prisma.registration.findUnique({ where: { id: req.params.id } });
    if (!reg) throw new HttpError(404, 'Registration not found.');
    const updated = await prisma.registration.update({
      where: { id: reg.id },
      data: {
        eligibilityOverride: true,
        eligibilityStatus: eligible ? 'OVERRIDDEN' : 'INELIGIBLE',
        overrideReason: reason,
        overrideBy: req.user!.id,
        ...(eligible && reg.status === 'EXCLUDED' ? { status: 'SUBMITTED' } : {}),
      },
    });
    await recordAudit({
      userId: req.user!.id,
      role: 'ADMIN',
      action: 'ELIGIBILITY_OVERRIDE',
      entityType: 'Registration',
      entityId: reg.id,
      reason,
      previousValue: { eligibilityStatus: reg.eligibilityStatus },
      newValue: { eligibilityStatus: updated.eligibilityStatus },
    });
    res.json(updated);
  })
);

export default router;
