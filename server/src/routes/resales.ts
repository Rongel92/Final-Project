import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils';
import { recordAudit } from '../services/audit';
import { EMPLOYEE_VISIBLE_STATUS } from '../constants';
import { computePreResaleStats } from '../services/resale';
import { backupDatabase } from '../services/backup';
import { PICKUP_EMAIL_TEMPLATE, sendComposedEmail } from '../services/emails';

const router = Router();

const resaleInput = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  site: z.string().optional(),
  eligibleDepartments: z.array(z.string()).optional(),
  eligibleGroups: z.array(z.string()).optional(),
  registrationOpenAt: z.string().optional().nullable(),
  registrationCloseAt: z.string(),
  resaleAt: z.string().optional().nullable(),
  cooldownMonths: z.number().int().min(1).max(240).default(36),
  eligibilityMode: z.enum(['PARTICIPATION', 'PURCHASE']).default('PURCHASE'),
  maxRegistrations: z.number().int().min(1).default(1),
  allowCancellation: z.boolean().default(true),
  autoPublishResults: z.boolean().default(false),
  openOnPublish: z.boolean().default(false),
  termsVersion: z.string().default('1.0'),
});

function validateDates(openAt: string, closeAt: string) {
  if (new Date(closeAt) <= new Date(openAt)) {
    throw new HttpError(400, 'Registration closing date must be after the opening date.');
  }
}

// LIST — employees only see published/relevant resales; admins see everything.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const isAdmin = req.user!.role === 'ADMIN';
    const resales = await prisma.resale.findMany({
      where: isAdmin ? undefined : { status: { in: EMPLOYEE_VISIBLE_STATUS } },
      include: {
        models: { include: { laptopModel: true } },
        _count: { select: { registrations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Attach the current user's registration status for each resale.
    const myRegs = await prisma.registration.findMany({
      where: { userId: req.user!.id },
      include: {
        modelChoices: { orderBy: { priority: 'asc' } },
        handover: { include: { administrator: true } },
      },
    });
    const enriched = resales.map((l) => {
      // A cancelled registration frees the slot — treat it as "not registered"
      // so the user can register again while the resale is still open.
      const myReg = myRegs.find((r) => r.resaleId === l.id && r.status !== 'CANCELLED');
      const totalLaptops = l.models.reduce((sum, m) => sum + m.quantity, 0);
      const h = myReg?.handover;
      // Only surface a decline banner when an administrator declined the winner
      // (self-forfeits set no administratorId).
      const adminDeclined = Boolean(h?.declinedAt && h?.administratorId);
      return {
        ...l,
        totalLaptops,
        modelCount: l.models.length,
        myRegistration: myReg
          ? {
              id: myReg.id,
              status: myReg.status,
              selectedLaptopModelId: myReg.selectedLaptopModelId,
              selectedLaptopModelIds: myReg.modelChoices.map((c) => c.laptopModelId),
              handoverAccepted: Boolean(
                myReg.handover?.claimedAt &&
                  !myReg.handover?.completedAt &&
                  !myReg.handover?.declinedAt
              ),
              declined: adminDeclined,
              declineReason: adminDeclined ? h?.declineReason ?? null : null,
              declinedByName: adminDeclined ? h?.administrator?.fullName ?? null : null,
              declineAcknowledgedAt: h?.declineAcknowledgedAt ?? null,
              appealSubmittedAt: h?.appealSubmittedAt ?? null,
            }
          : null,
      };
    });
    res.json(enriched);
  })
);

// DETAIL
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const resale = await prisma.resale.findUnique({
      where: { id: req.params.id },
      include: {
        models: { include: { laptopModel: true } },
        forms: { where: { isActive: true } },
        _count: { select: { registrations: true } },
      },
    });
    if (!resale) throw new HttpError(404, 'Resale not found.');
    if (req.user!.role !== 'ADMIN' && !EMPLOYEE_VISIBLE_STATUS.includes(resale.status as never)) {
      throw new HttpError(403, 'This resale is not available.');
    }
    const myReg = await prisma.registration.findFirst({
      where: { resaleId: resale.id, userId: req.user!.id, status: { not: 'CANCELLED' } },
      include: { modelChoices: { orderBy: { priority: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      ...resale,
      myRegistration: myReg
        ? {
            ...myReg,
            selectedLaptopModelIds: myReg.modelChoices.map((c) => c.laptopModelId),
          }
        : null,
    });
  })
);

// CREATE
router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = resaleInput.parse(req.body);
    // When "open on publish" is chosen the opening time is decided at publish
    // time, so we pin it to now as a placeholder and skip the future check.
    const nowTs = new Date();
    const openAtStr = data.openOnPublish ? nowTs.toISOString() : data.registrationOpenAt;
    if (!openAtStr) {
      throw new HttpError(400, 'Registration opening date is required.');
    }
    validateDates(openAtStr, data.registrationCloseAt);
    // New resales must be scheduled entirely in the future.
    const futureDates: [string | null | undefined, string][] = [
      ...(data.openOnPublish
        ? []
        : ([[data.registrationOpenAt, 'Registration opening date']] as [string | null | undefined, string][])),
      [data.registrationCloseAt, 'Registration closing date'],
      [data.resaleAt, 'Expected resale date'],
    ];
    for (const [value, label] of futureDates) {
      if (value && new Date(value) <= nowTs) {
        throw new HttpError(400, `${label} must be in the future.`);
      }
    }
    // Titles are always auto-assigned sequentially: Resale-1, Resale-2, …
    const existingTitles = await prisma.resale.findMany({ select: { title: true } });
    let maxResaleNumber = 0;
    for (const { title } of existingTitles) {
      const match = /^Resale-(\d+)$/.exec(title);
      if (match) maxResaleNumber = Math.max(maxResaleNumber, Number(match[1]));
    }
    const resaleTitle = `Resale-${maxResaleNumber + 1}`;
    const resale = await prisma.resale.create({
      data: {
        title: resaleTitle,
        description: data.description,
        instructions: data.instructions,
        site: data.site,
        eligibleDepartments: data.eligibleDepartments
          ? JSON.stringify(data.eligibleDepartments)
          : null,
        eligibleGroups: data.eligibleGroups ? JSON.stringify(data.eligibleGroups) : null,
        registrationOpenAt: new Date(openAtStr),
        registrationCloseAt: new Date(data.registrationCloseAt),
        resaleAt: data.resaleAt ? new Date(data.resaleAt) : null,
        cooldownMonths: data.cooldownMonths,
        eligibilityMode: data.eligibilityMode,
        maxRegistrations: 1,
        allowCancellation: data.allowCancellation,
        autoPublishResults: true,
        openOnPublish: data.openOnPublish,
        termsVersion: data.termsVersion,
        createdBy: req.user!.id,
        status: 'DRAFT',
      },
    });
    await recordAudit({
      userId: req.user!.id,
      role: 'ADMIN',
      action: 'RESALE_CREATED',
      entityType: 'Resale',
      entityId: resale.id,
      newValue: { title: resale.title },
    });
    res.status(201).json(resale);
  })
);

// UPDATE
router.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.resale.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Resale not found.');
    if (!['DRAFT', 'SCHEDULED'].includes(existing.status)) {
      throw new HttpError(400, 'This resale can no longer be edited.');
    }
    const data = resaleInput.partial().parse(req.body);
    if (data.openOnPublish === false && data.registrationOpenAt && data.registrationCloseAt) {
      validateDates(data.registrationOpenAt, data.registrationCloseAt);
    }
    // If switching to open-on-publish, pin the opening time to now (it will be
    // reset again at the moment of publishing).
    const openAtUpdate =
      data.openOnPublish === true
        ? { registrationOpenAt: new Date() }
        : data.registrationOpenAt
          ? { registrationOpenAt: new Date(data.registrationOpenAt) }
          : {};
    const updated = await prisma.resale.update({
      where: { id: req.params.id },
      data: {
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.instructions !== undefined ? { instructions: data.instructions } : {}),
        ...(data.site !== undefined ? { site: data.site } : {}),
        ...(data.eligibleDepartments !== undefined
          ? { eligibleDepartments: JSON.stringify(data.eligibleDepartments) }
          : {}),
        ...(data.eligibleGroups !== undefined
          ? { eligibleGroups: JSON.stringify(data.eligibleGroups) }
          : {}),
        ...openAtUpdate,
        ...(data.registrationCloseAt
          ? { registrationCloseAt: new Date(data.registrationCloseAt) }
          : {}),
        ...(data.resaleAt !== undefined ? { resaleAt: data.resaleAt ? new Date(data.resaleAt) : null } : {}),
        ...(data.cooldownMonths !== undefined ? { cooldownMonths: data.cooldownMonths } : {}),
        ...(data.eligibilityMode !== undefined ? { eligibilityMode: data.eligibilityMode } : {}),
        ...(data.maxRegistrations !== undefined ? { maxRegistrations: data.maxRegistrations } : {}),
        ...(data.allowCancellation !== undefined ? { allowCancellation: data.allowCancellation } : {}),
        ...(data.autoPublishResults !== undefined
          ? { autoPublishResults: data.autoPublishResults }
          : {}),
        ...(data.openOnPublish !== undefined ? { openOnPublish: data.openOnPublish } : {}),
        ...(data.termsVersion !== undefined ? { termsVersion: data.termsVersion } : {}),
      },
    });
    await recordAudit({
      userId: req.user!.id,
      role: 'ADMIN',
      action: 'RESALE_EDITED',
      entityType: 'Resale',
      entityId: updated.id,
      previousValue: { status: existing.status },
      newValue: { title: updated.title },
    });
    res.json(updated);
  })
);

// ADD / UPDATE laptop model on a resale
const modelLinkInput = z.object({
  laptopModelId: z.string(),
  quantity: z.number().int().min(1),
  notes: z.string().optional(),
});

router.post(
  '/:id/models',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const resale = await prisma.resale.findUnique({ where: { id: req.params.id } });
    if (!resale) throw new HttpError(404, 'Resale not found.');
    const data = modelLinkInput.parse(req.body);
    // A resale can only offer as many units of a model as exist in inventory.
    const model = await prisma.laptopModel.findUnique({ where: { id: data.laptopModelId } });
    if (!model) throw new HttpError(404, 'Model not found.');
    const availableUnits = await prisma.laptopUnit.count({
      where: { laptopModelId: data.laptopModelId, status: 'AVAILABLE' },
    });
    if (availableUnits === 0) {
      throw new HttpError(400, 'This model has no available units in inventory.');
    }
    if (data.quantity > availableUnits) {
      throw new HttpError(
        400,
        `Only ${availableUnits} unit(s) of this model are available in inventory.`
      );
    }
    const link = await prisma.resaleLaptopModel.upsert({
      where: {
        resaleId_laptopModelId: {
          resaleId: req.params.id,
          laptopModelId: data.laptopModelId,
        },
      },
      create: {
        resaleId: req.params.id,
        laptopModelId: data.laptopModelId,
        quantity: data.quantity,
        price: model.price,
        notes: data.notes,
      },
      update: {
        quantity: data.quantity,
        price: model.price,
        notes: data.notes,
      },
      include: { laptopModel: true },
    });
    res.status(201).json(link);
  })
);

router.delete(
  '/:id/models/:modelId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.resaleLaptopModel.deleteMany({
      where: { resaleId: req.params.id, laptopModelId: req.params.modelId },
    });
    res.status(204).end();
  })
);

// STATUS TRANSITIONS
async function transition(req: any, targetStatus: string, action: string, guard?: () => Promise<void>) {
  const resale = await prisma.resale.findUnique({
    where: { id: req.params.id },
    include: { models: true },
  });
  if (!resale) throw new HttpError(404, 'Resale not found.');
  if (guard) await guard();
  const updated = await prisma.resale.update({
    where: { id: resale.id },
    data: {
      status: targetStatus,
      ...(targetStatus === 'OPEN' || targetStatus === 'SCHEDULED'
        ? { publishedAt: resale.publishedAt ?? new Date() }
        : {}),
      ...(targetStatus === 'CLOSED'
        ? {
            closedAt: new Date(),
            // Reflect the real close time so timelines everywhere are accurate
            // when an admin closes registration before the scheduled deadline.
            ...(resale.registrationCloseAt > new Date() ? { registrationCloseAt: new Date() } : {}),
          }
        : {}),
    },
  });
  await recordAudit({
    userId: req.user.id,
    role: 'ADMIN',
    action,
    entityType: 'Resale',
    entityId: resale.id,
    previousValue: { status: resale.status },
    newValue: { status: targetStatus },
    reason: req.body?.reason,
  });
  return updated;
}

// PUBLISH — validates before making the resale visible to employees.
router.post(
  '/:id/publish',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const resale = await prisma.resale.findUnique({
      where: { id: req.params.id },
      include: { models: true, forms: { where: { isActive: true } } },
    });
    if (!resale) throw new HttpError(404, 'Resale not found.');
    if (resale.models.length === 0) {
      throw new HttpError(400, 'Add at least one laptop model before publishing.');
    }
    if (resale.models.some((m) => m.quantity <= 0)) {
      throw new HttpError(400, 'Every laptop model must have a quantity greater than zero.');
    }
    if (resale.models.some((m) => m.price < 0)) {
      throw new HttpError(400, 'Prices cannot be negative.');
    }
    validateDates(resale.registrationOpenAt.toISOString(), resale.registrationCloseAt.toISOString());

    const now = new Date();
    // "Open on publish" resales start accepting registrations the instant they go
    // live, so pin the opening time to now at publish.
    let openAt = resale.registrationOpenAt;
    if (resale.openOnPublish) {
      openAt = now;
      await prisma.resale.update({ where: { id: resale.id }, data: { registrationOpenAt: now } });
    }
    const status = openAt > now ? 'SCHEDULED' : 'OPEN';
    const updated = await transition(req, status, 'RESALE_PUBLISHED');
    res.json(updated);
  })
);

type WinnerRecipient = Awaited<ReturnType<typeof winnerRecipients>>[number];

async function winnerRecipients(resaleId: string) {
  return prisma.resaleResult.findMany({
    where: { resaleId, resultType: 'WINNER' },
    include: {
      registration: {
        include: {
          user: true,
          handover: { select: { claimedAt: true, declinedAt: true, completedAt: true } },
        },
      },
      laptopModel: true,
    },
  });
}

// ADMIN-WRITTEN EMAILS TO WINNERS. GET returns the editable starting text plus how
// many winners it will reach; POST sends the admin's edited version to each of
// them through the paced outbox (same batching as the automatic emails).
function composedEmailRoutes(
  path: string,
  options: {
    template: { subject: string; body: string };
    recipients: (winners: WinnerRecipient[]) => WinnerRecipient[];
    auditAction: string;
    noRecipientsMessage: string;
  }
) {
  const recipientsFor = async (resaleId: string) => options.recipients(await winnerRecipients(resaleId));

  router.get(
    `/:id/${path}`,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const resale = await prisma.resale.findUnique({ where: { id: req.params.id } });
      if (!resale) throw new HttpError(404, 'Resale not found.');
      const recipients = await recipientsFor(resale.id);
      res.json({ ...options.template, recipients: recipients.length });
    })
  );

  router.post(
    `/:id/${path}`,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const parsed = z
        .object({
          subject: z.string().trim().min(1, 'Enter a subject.').max(200, 'The subject is too long.'),
          body: z.string().trim().min(1, 'The email is empty.').max(10000, 'The email is too long.'),
        })
        .parse(req.body);
      const subject = parsed.subject.replace(/\s+/g, ' ');
      const { body } = parsed;

      const resale = await prisma.resale.findUnique({ where: { id: req.params.id } });
      if (!resale) throw new HttpError(404, 'Resale not found.');

      const recipients = await recipientsFor(resale.id);
      if (recipients.length === 0) throw new HttpError(400, options.noRecipientsMessage);

      await Promise.all(
        recipients.map((w) =>
          sendComposedEmail({
            to: w.registration.user.email,
            fullName: w.registration.user.fullName,
            modelName: `${w.laptopModel.manufacturer} ${w.laptopModel.modelName}`,
            registrationId: w.registrationId,
            subject,
            body,
          })
        )
      );

      await recordAudit({
        userId: req.user!.id,
        role: 'ADMIN',
        action: options.auditAction,
        entityType: 'Resale',
        entityId: resale.id,
        newValue: { recipients: recipients.length, subject, body },
      });

      res.json({ sent: recipients.length });
    })
  );
}

// PICKUP DETAILS — every winner who has not declined (a declined winner keeps
// their WINNER row but has no laptop to collect), wherever they are in the
// handover flow. Starts from an editable template.
composedEmailRoutes('pickup-email', {
  template: PICKUP_EMAIL_TEMPLATE,
  recipients: (winners) => winners.filter((w) => !w.registration.handover?.declinedAt),
  auditAction: 'PICKUP_EMAIL_SENT',
  noRecipientsMessage: 'There are no winners to notify yet.',
});

// PENDING NOTICE — winners who have not accepted (or declined) their laptop yet.
// Starts blank for the admin to write.
composedEmailRoutes('pending-notice', {
  template: { subject: '', body: '' },
  recipients: (winners) =>
    winners.filter((w) => {
      const h = w.registration.handover;
      return !h || (!h.claimedAt && !h.declinedAt && !h.completedAt);
    }),
  auditAction: 'PENDING_NOTICE_SENT',
  noRecipientsMessage: 'Every winner has already accepted or declined.',
});

router.post(
  '/:id/close',
  requireAdmin,
  asyncHandler(async (req, res) => res.json(await transition(req, 'CLOSED', 'RESALE_CLOSED')))
);

// COMPLETE — an administrator manually closes the resale once every winner's
// handover has been physically completed or declined. There is no automatic or
// time-based completion: only an admin can close a resale, and only after all
// laptops have been handed over.
router.post(
  '/:id/complete',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const resale = await prisma.resale.findUnique({ where: { id: req.params.id } });
    if (!resale) throw new HttpError(404, 'Resale not found.');
    if (resale.status !== 'RESULTS_PUBLISHED' && resale.status !== 'PICKUP') {
      throw new HttpError(400, 'Only resales with published results can be completed.');
    }
    const winners = await prisma.resaleResult.findMany({
      where: { resaleId: resale.id, resultType: 'WINNER' },
      include: { assignment: true },
    });
    if (winners.length === 0) {
      throw new HttpError(400, 'There are no winners to hand over yet.');
    }
    const unresolved = winners.filter(
      (w) =>
        !w.assignment ||
        (w.assignment.status !== 'COMPLETED' && w.assignment.status !== 'DECLINED')
    );
    if (unresolved.length > 0) {
      throw new HttpError(
        400,
        `Every winner's handover must be completed or forfeited first (${unresolved.length} still open).`
      );
    }
    const updated = await transition(req, 'COMPLETED', 'RESALE_COMPLETED');
    // The waiting list ends with the resale — nobody can be promoted any more —
    // so its entries become "not selected" instead of reading as still pending.
    await prisma.registration.updateMany({
      where: { resaleId: resale.id, status: 'WAITING_LIST' },
      data: { status: 'NOT_SELECTED' },
    });
    res.json(updated);

    // Snapshot the database after a resale is completed. A backup failure must
    // never fail the completion itself, so we log and swallow any error.
    backupDatabase(`resale ${resale.id} completed`).catch((err) =>
      console.error('[backup] failed to snapshot database after resale completion:', err)
    );
  })
);

router.post(
  '/:id/cancel',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const updated = await transition(req, 'CANCELLED', 'RESALE_CANCELLED');
    res.json(updated);
  })
);

router.post(
  '/:id/archive',
  requireAdmin,
  asyncHandler(async (req, res) => res.json(await transition(req, 'ARCHIVED', 'RESALE_ARCHIVED')))
);

// UNARCHIVE — restore an archived resale to the status it held before archiving.
router.post(
  '/:id/unarchive',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const resale = await prisma.resale.findUnique({ where: { id: req.params.id } });
    if (!resale) throw new HttpError(404, 'Resale not found.');
    if (resale.status !== 'ARCHIVED') {
      throw new HttpError(400, 'Only archived resales can be unarchived.');
    }
    // Recover the pre-archive status from the audit trail (falls back to COMPLETED).
    const lastArchive = await prisma.auditLog.findFirst({
      where: { entityType: 'Resale', entityId: resale.id, action: 'RESALE_ARCHIVED' },
      orderBy: { createdAt: 'desc' },
    });
    let restoreStatus = 'COMPLETED';
    if (lastArchive?.previousValue) {
      try {
        const parsed = JSON.parse(lastArchive.previousValue) as { status?: string };
        if (parsed.status) restoreStatus = parsed.status;
      } catch {
        // ignore malformed audit payloads and keep the COMPLETED fallback
      }
    }
    const updated = await prisma.resale.update({
      where: { id: resale.id },
      data: { status: restoreStatus },
    });
    await recordAudit({
      userId: req.user!.id,
      role: 'ADMIN',
      action: 'RESALE_EDITED',
      entityType: 'Resale',
      entityId: resale.id,
      previousValue: { status: 'ARCHIVED' },
      newValue: { status: restoreStatus },
      reason: 'Unarchived',
    });
    res.json(updated);
  })
);

// DELETE — permanently remove a resale and its related records.
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const resale = await prisma.resale.findUnique({ where: { id: req.params.id } });
    if (!resale) throw new HttpError(404, 'Resale not found.');
    await prisma.$transaction([
      // Release any inventory units reserved/assigned to this resale.
      prisma.laptopUnit.updateMany({
        where: { assignedResaleId: resale.id },
        data: { assignedResaleId: null, assignedUserId: null, status: 'AVAILABLE' },
      }),
      prisma.notification.deleteMany({ where: { resaleId: resale.id } }),
      prisma.resale.delete({ where: { id: resale.id } }),
    ]);
    await recordAudit({
      userId: req.user!.id,
      role: 'ADMIN',
      action: 'RESALE_DELETED',
      entityType: 'Resale',
      entityId: resale.id,
      previousValue: { title: resale.title, status: resale.status },
    });
    res.status(204).end();
  })
);

// PRE-RESALE VALIDATION STATS
router.get(
  '/:id/pre-resale',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await computePreResaleStats(req.params.id));
  })
);

export default router;
