import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils';
import { recordAudit } from '../services/audit';
import { notify } from '../services/notifications';
import { sendAdminDeclineEmail, sendHandoverCompletedEmail, sendSelfDeclineEmail } from '../services/emails';
import { recordParticipation } from '../services/eligibility';
import { changeWinnerAssignmentStatus } from '../services/results';
import { renderAgreementPdf } from '../services/agreementPdf';
import { AGREEMENT_VERSION, renderPurchaseAgreement } from '../constants';

const router = Router();

// Ensures a handover record exists for a winning registration and returns the
// full pickup context (model, price, pickup location, active handover form).
async function loadPickupContext(registrationId: string) {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      user: true,
      resale: { include: { models: { include: { laptopModel: true } } } },
      results: { include: { laptopModel: true, assignment: { include: { laptopUnit: true } } } },
      handover: { include: { administrator: true } },
    },
  });
  if (!reg) throw new HttpError(404, 'Registration not found.');

  const winnerResult = reg.results.find((r) => r.resultType === 'WINNER');
  const modelId = reg.selectedLaptopModelId ?? winnerResult?.laptopModelId ?? null;
  const modelLink = reg.resale.models.find((m) => m.laptopModelId === modelId) ?? null;
  const unit = winnerResult?.assignment?.laptopUnit ?? null;

  return { reg, winnerResult, modelId, modelLink, unit };
}

// GET pickup / handover details.
router.get(
  '/pickup/:registrationId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await loadPickupContext(req.params.registrationId);
    if (req.user!.role !== 'ADMIN' && ctx.reg.userId !== req.user!.id) {
      throw new HttpError(403, 'Access denied.');
    }
    if (ctx.reg.status !== 'WINNER' && ctx.reg.status !== 'COMPLETED' && !ctx.reg.handover?.declinedAt) {
      throw new HttpError(400, 'This registration is not eligible for pickup.');
    }
    res.json({
      registration: ctx.reg,
      model: ctx.modelLink,
      unit: ctx.unit,
      handover: ctx.reg.handover,
    });
  })
);

export async function ensureHandover(registrationId: string) {
  const ctx = await loadPickupContext(registrationId);
  if (ctx.reg.handover) return ctx.reg.handover;
  return prisma.handoverRecord.create({
    data: {
      registrationId,
      userId: ctx.reg.userId,
      resaleId: ctx.reg.resaleId,
      laptopModelId: ctx.modelId!,
      laptopUnitId: ctx.unit?.id ?? null,
      serialNumber: ctx.unit?.serialNumber ?? null,
      assetNumber: ctx.unit?.assetNumber ?? null,
      price: ctx.modelLink?.price ?? null,
      pickupLocation: ctx.modelLink?.pickupLocation ?? null,
    },
  });
}

// EMPLOYEE electronic confirmation.
router.post(
  '/:registrationId/employee-confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { fullName, idNumber, signatureData, payrollDeductionConfirmed } = z
      .object({
        fullName: z.string().min(2),
        idNumber: z.string().min(1),
        signatureData: z.string().startsWith('data:image', 'A signature is required.'),
        payrollDeductionConfirmed: z.boolean(),
      })
      .parse(req.body);

    const ctx = await loadPickupContext(req.params.registrationId);
    if (req.user!.role !== 'ADMIN' && ctx.reg.userId !== req.user!.id) {
      throw new HttpError(403, 'Access denied.');
    }
    if (!payrollDeductionConfirmed) {
      throw new HttpError(400, 'Payroll deduction must be confirmed.');
    }

    const handover = await ensureHandover(req.params.registrationId);
    const price = ctx.modelLink?.price ?? handover.price ?? null;
    const updated = await prisma.handoverRecord.update({
      where: { id: handover.id },
      data: {
        employeeConfirmation: true,
        employeeTypedName: fullName.trim(),
        idNumber: idNumber.trim(),
        signatureData,
        agreementVersion: AGREEMENT_VERSION,
        agreementText: renderPurchaseAgreement(price),
        employeeConfirmedAt: new Date(),
        payrollDeductionConfirmed: true,
      },
    });
    await recordAudit({
      userId: req.user!.id,
      action: 'HANDOVER_EMPLOYEE_CONFIRMED',
      entityType: 'HandoverRecord',
      entityId: updated.id,
      newValue: { registrationId: updated.registrationId },
    });
    await maybeComplete(updated.id, req.user!.id);
    res.json(await prisma.handoverRecord.findUnique({ where: { id: updated.id } }));
  })
);

// ADMIN confirmation (records serial/asset numbers, admin identity, notes).
router.post(
  '/:registrationId/admin-confirm',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { serialNumber, assetNumber, notes } = z
      .object({
        serialNumber: z.string().optional(),
        assetNumber: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const handover = await ensureHandover(req.params.registrationId);
    const updated = await prisma.handoverRecord.update({
      where: { id: handover.id },
      data: {
        administratorConfirmation: true,
        administratorId: req.user!.id,
        administratorConfirmedAt: new Date(),
        ...(serialNumber !== undefined ? { serialNumber } : {}),
        ...(assetNumber !== undefined ? { assetNumber } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });
    await recordAudit({
      userId: req.user!.id,
      action: 'HANDOVER_ADMIN_CONFIRMED',
      entityType: 'HandoverRecord',
      entityId: updated.id,
      newValue: { registrationId: updated.registrationId },
    });
    await maybeComplete(updated.id, req.user!.id);
    res.json(await prisma.handoverRecord.findUnique({ where: { id: updated.id } }));
  })
);

// ADMIN completes the physical handover in one step: captures the employee's
// signed purchase agreement (collected in person at pickup) together with the
// serial/asset being handed over, and marks the handover complete.
router.post(
  '/:registrationId/handover-complete',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { fullName, idNumber, signatureData, payrollDeductionConfirmed, serialNumber } = z
      .object({
        fullName: z.string().min(2),
        idNumber: z.string().regex(/^\d{9,}$/, 'ID number must be at least 9 digits.'),
        signatureData: z.string().startsWith('data:image', 'A signature is required.'),
        payrollDeductionConfirmed: z.boolean(),
        serialNumber: z.string().min(1, 'A serial number is required.'),
      })
      .parse(req.body);

    if (!payrollDeductionConfirmed) {
      throw new HttpError(400, 'Payroll deduction must be confirmed.');
    }

    const ctx = await loadPickupContext(req.params.registrationId);
    if (ctx.reg.handover?.completedAt) {
      throw new HttpError(400, 'This handover is already complete.');
    }
    if (ctx.reg.handover?.declinedAt) {
      throw new HttpError(400, 'This laptop has been forfeited and cannot be handed over.');
    }

    const handover = await ensureHandover(req.params.registrationId);
    const price = ctx.modelLink?.price ?? handover.price ?? null;
    const now = new Date();
    const updated = await prisma.handoverRecord.update({
      where: { id: handover.id },
      data: {
        employeeConfirmation: true,
        employeeTypedName: fullName.trim(),
        idNumber: idNumber.trim(),
        signatureData,
        agreementVersion: AGREEMENT_VERSION,
        agreementText: renderPurchaseAgreement(price),
        employeeConfirmedAt: handover.employeeConfirmedAt ?? now,
        payrollDeductionConfirmed: true,
        administratorConfirmation: true,
        administratorId: req.user!.id,
        administratorConfirmedAt: now,
        serialNumber,
      },
    });
    await recordAudit({
      userId: req.user!.id,
      action: 'HANDOVER_EMPLOYEE_CONFIRMED',
      entityType: 'HandoverRecord',
      entityId: updated.id,
      newValue: { registrationId: updated.registrationId, viaAdminPickup: true },
    });
    await recordAudit({
      userId: req.user!.id,
      action: 'HANDOVER_ADMIN_CONFIRMED',
      entityType: 'HandoverRecord',
      entityId: updated.id,
      newValue: { registrationId: updated.registrationId },
    });
    await maybeComplete(updated.id, req.user!.id);
    res.json(await prisma.handoverRecord.findUnique({ where: { id: updated.id } }));
  })
);

// EMPLOYEE claims (accepts) the won laptop. No signature at this stage — the
// signed purchase agreement is captured later at physical pickup.
router.post(
  '/:registrationId/claim',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await loadPickupContext(req.params.registrationId);
    const isAdmin = req.user!.role === 'ADMIN';
    if (!isAdmin && ctx.reg.userId !== req.user!.id) {
      throw new HttpError(403, 'Access denied.');
    }
    if (ctx.reg.handover?.completedAt) {
      throw new HttpError(400, 'This handover is already complete.');
    }
    if (ctx.reg.handover?.declinedAt) {
      throw new HttpError(400, 'This laptop has already been forfeited.');
    }

    const handover = await ensureHandover(req.params.registrationId);
    if (handover.claimedAt) {
      res.json(handover);
      return;
    }
    const updated = await prisma.handoverRecord.update({
      where: { id: handover.id },
      data: { claimedAt: new Date() },
    });
    await recordAudit({
      userId: req.user!.id,
      action: 'HANDOVER_CLAIMED',
      entityType: 'HandoverRecord',
      entityId: updated.id,
      newValue: { registrationId: updated.registrationId },
    });
    await notify({
      userId: handover.userId,
      type: 'ADMIN_UPDATE',
      title: 'Laptop accepted',
      message: `You accepted your laptop for "${ctx.reg.resale.title}". You'll receive an email soon with your pickup date and time.`,
      resaleId: handover.resaleId,
      registrationId: handover.registrationId,
    });
    res.json(await prisma.handoverRecord.findUnique({ where: { id: updated.id } }));
  })
);

// The winner (or an administrator on their behalf) declines the handover, i.e.
// chooses not to pick up the laptop. This also declines the underlying winner
// assignment so the next waiting-list entry is promoted, and stamps the handover
// so it moves to the handover history.
router.post(
  '/:registrationId/decline',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);

    const ctx = await loadPickupContext(req.params.registrationId);
    const isAdmin = req.user!.role === 'ADMIN';
    if (!isAdmin && ctx.reg.userId !== req.user!.id) {
      throw new HttpError(403, 'Access denied.');
    }
    if (ctx.reg.handover?.completedAt) {
      throw new HttpError(400, 'This handover is already complete and cannot be declined.');
    }
    if (ctx.reg.handover?.declinedAt) {
      throw new HttpError(400, 'This handover has already been declined.');
    }

    const handover = await ensureHandover(req.params.registrationId);
    const now = new Date();
    await prisma.handoverRecord.update({
      where: { id: handover.id },
      data: {
        declinedAt: now,
        declineReason: reason ?? null,
        // Record which admin declined so the employee can see who.
        ...(isAdmin ? { administratorId: req.user!.id } : {}),
      },
    });

    // Decline the winner assignment (promotes the next waiting-list entry).
    if (ctx.winnerResult?.assignment) {
      await changeWinnerAssignmentStatus(
        ctx.winnerResult.assignment.id,
        'DECLINED',
        req.user!.id,
        reason
      );
    }

    await recordAudit({
      userId: req.user!.id,
      action: 'HANDOVER_DECLINED',
      entityType: 'HandoverRecord',
      entityId: handover.id,
      newValue: { registrationId: handover.registrationId, reason: reason ?? null },
    });

    const lm = ctx.modelLink?.laptopModel;
    const modelName = lm ? `${lm.manufacturer} ${lm.modelName}` : 'the laptop';
    if (isAdmin) {
      // Admin-initiated cancellation: keep the in-app notice (the employee can
      // acknowledge) and email them the reason + who.
      await notify({
        userId: handover.userId,
        type: 'ADMIN_UPDATE',
        title: 'Handover declined',
        message: `Your laptop handover for "${ctx.reg.resale.title}" was declined by an administrator.`,
        resaleId: handover.resaleId,
        registrationId: handover.registrationId,
      });
      await sendAdminDeclineEmail({
        to: ctx.reg.user.email,
        fullName: ctx.reg.user.fullName,
        resaleTitle: ctx.reg.resale.title,
        modelName,
        reason: reason ?? null,
        adminName: req.user!.fullName,
      });
    } else {
      // Self-decline: no in-app notice — just an email confirming the employee
      // chose to decline.
      await sendSelfDeclineEmail({
        to: ctx.reg.user.email,
        fullName: ctx.reg.user.fullName,
        resaleTitle: ctx.reg.resale.title,
        modelName,
      });
    }

    res.json(await prisma.handoverRecord.findUnique({ where: { id: handover.id } }));
  })
);

// An administrator restores (undoes) a decline they previously applied, putting
// the winner back in the PENDING/claim state. If a waiting-list runner-up was
// promoted to winner because of the decline, the restore still proceeds — the
// admin is simply informed (in the UI) so they can resolve that person separately.
router.post(
  '/:registrationId/decline-restore',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const ctx = await loadPickupContext(req.params.registrationId);
    const handover = ctx.reg.handover;
    if (!handover?.declinedAt) {
      throw new HttpError(400, 'This handover has not been declined.');
    }
    if (handover.completedAt) {
      throw new HttpError(400, 'This handover is already complete and cannot be restored.');
    }

    await prisma.handoverRecord.update({
      where: { id: handover.id },
      data: {
        declinedAt: null,
        declineReason: null,
        administratorId: null,
        declineAcknowledgedAt: null,
        appealSubmittedAt: null,
        appealText: null,
      },
    });

    // Put the winner assignment and registration back into the pending win state.
    if (ctx.winnerResult?.assignment) {
      await prisma.winnerAssignment.update({
        where: { id: ctx.winnerResult.assignment.id },
        data: { status: 'PENDING', respondedAt: null },
      });
    }
    await prisma.registration.update({
      where: { id: ctx.reg.id },
      data: { status: 'WINNER' },
    });

    await recordAudit({
      userId: req.user!.id,
      action: 'HANDOVER_DECLINE_RESTORED',
      entityType: 'HandoverRecord',
      entityId: handover.id,
      newValue: { registrationId: ctx.reg.id },
    });
    await notify({
      userId: handover.userId,
      type: 'ADMIN_UPDATE',
      title: 'Your win was restored',
      message: `An administrator restored your selection for "${ctx.reg.resale.title}". You can claim your laptop again.`,
      resaleId: handover.resaleId,
      registrationId: handover.registrationId,
      actionUrl: `/pickup/${handover.registrationId}`,
    });

    res.json(await prisma.handoverRecord.findUnique({ where: { id: handover.id } }));
  })
);

// The employee acknowledges (accepts) an administrator's decline — no appeal.
router.post(
  '/:registrationId/decline-acknowledge',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await loadPickupContext(req.params.registrationId);
    if (ctx.reg.userId !== req.user!.id) throw new HttpError(403, 'Access denied.');
    if (!ctx.reg.handover?.declinedAt) {
      throw new HttpError(400, 'This handover has not been declined.');
    }
    await prisma.handoverRecord.update({
      where: { id: ctx.reg.handover.id },
      data: { declineAcknowledgedAt: new Date() },
    });
    await recordAudit({
      userId: req.user!.id,
      action: 'HANDOVER_DECLINE_ACKNOWLEDGED',
      entityType: 'HandoverRecord',
      entityId: ctx.reg.handover.id,
      newValue: { registrationId: ctx.reg.id },
    });
    res.json(await prisma.handoverRecord.findUnique({ where: { id: ctx.reg.handover.id } }));
  })
);

// Completes the handover only when BOTH parties have confirmed.
async function maybeComplete(handoverId: string, actorId: string) {
  const handover = await prisma.handoverRecord.findUnique({
    where: { id: handoverId },
    include: { resale: true, laptopModel: true, user: true },
  });
  if (!handover) return;
  if (!handover.employeeConfirmation || !handover.administratorConfirmation) return;
  if (handover.completedAt) return;

  let clearedOverride: string | null = null;

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.handoverRecord.update({ where: { id: handover.id }, data: { completedAt: now } });
    await tx.registration.update({
      where: { id: handover.registrationId },
      data: { status: 'COMPLETED' },
    });
    // Mark the winner assignment as completed so the results view reflects pickup.
    const winnerResult = await tx.resaleResult.findFirst({
      where: { registrationId: handover.registrationId, resultType: 'WINNER' },
      include: { assignment: true },
    });
    if (winnerResult?.assignment) {
      await tx.winnerAssignment.update({
        where: { id: winnerResult.assignment.id },
        data: { status: 'COMPLETED', respondedAt: winnerResult.assignment.respondedAt ?? now },
      });
    }
    // Claim a physical unit so inventory reflects the handover. If the resale did
    // not reserve a specific unit, take an available one of the same model
    // (preferring one assigned to this resale).
    let unitId = handover.laptopUnitId;
    if (!unitId) {
      const preferred = await tx.laptopUnit.findFirst({
        where: {
          laptopModelId: handover.laptopModelId,
          status: 'AVAILABLE',
          assignedResaleId: handover.resaleId,
        },
        orderBy: { createdAt: 'asc' },
      });
      const chosen =
        preferred ??
        (await tx.laptopUnit.findFirst({
          where: { laptopModelId: handover.laptopModelId, status: 'AVAILABLE' },
          orderBy: { createdAt: 'asc' },
        }));
      unitId = chosen?.id ?? null;
    }
    if (unitId) {
      const unit = await tx.laptopUnit.update({
        where: { id: unitId },
        data: { status: 'HANDED_OVER', assignedUserId: handover.userId },
      });
      if (!handover.laptopUnitId) {
        await tx.handoverRecord.update({
          where: { id: handover.id },
          data: {
            laptopUnitId: unit.id,
            serialNumber: handover.serialNumber ?? unit.serialNumber,
            assetNumber: handover.assetNumber ?? unit.assetNumber,
          },
        });
      }
    }
    // Update participation history: mark winner + purchase completed.
    const participation = await tx.participationHistory.findFirst({
      where: { userId: handover.userId, resaleId: handover.resaleId },
    });
    if (participation) {
      await tx.participationHistory.update({
        where: { id: participation.id },
        data: { winner: true, purchaseCompleted: true, handoverCompletedAt: now },
      });
    } else {
      await recordParticipation(tx, {
        userId: handover.userId,
        resaleId: handover.resaleId,
        registrationId: handover.registrationId,
        cooldownMonths: handover.resale.cooldownMonths,
        winner: true,
        purchaseCompleted: true,
        handoverCompletedAt: now,
      });
    }

    // Once the laptop has actually been received, drop any manual eligibility
    // override so the normal cooldown (nextEligibleAt) governs going forward.
    const winnerUser = await tx.user.findUnique({
      where: { id: handover.userId },
      select: { manualEligibility: true },
    });
    if (winnerUser?.manualEligibility) {
      clearedOverride = winnerUser.manualEligibility;
      await tx.user.update({
        where: { id: handover.userId },
        data: { manualEligibility: null, eligibilityNote: null },
      });
    }
  });

  await recordAudit({
    userId: actorId,
    action: 'HANDOVER_COMPLETED',
    entityType: 'HandoverRecord',
    entityId: handover.id,
    newValue: { registrationId: handover.registrationId },
  });
  if (clearedOverride) {
    await recordAudit({
      userId: actorId,
      action: 'ELIGIBILITY_OVERRIDE_CLEARED',
      entityType: 'User',
      entityId: handover.userId,
      previousValue: { manualEligibility: clearedOverride },
      newValue: { manualEligibility: null, cause: 'RECEIVED_LAPTOP' },
    });
  }
  await notify({
    userId: handover.userId,
    type: 'ADMIN_UPDATE',
    title: 'Handover completed',
    message: `Your ${handover.laptopModel.manufacturer} ${handover.laptopModel.modelName} handover is complete. Thank you.`,
    resaleId: handover.resaleId,
    registrationId: handover.registrationId,
  });

  // Render the signed-agreement PDF, persist it on the record, and attach it to
  // the completion email. A PDF failure must never block completion.
  const finalHandover = await prisma.handoverRecord.findUnique({
    where: { id: handover.id },
    include: { user: true, resale: true, laptopModel: true, administrator: true },
  });
  let agreementPdf: Buffer | null = null;
  if (finalHandover) {
    try {
      agreementPdf = await renderAgreementPdf({
        employeeName: finalHandover.employeeTypedName || finalHandover.user.fullName,
        modelName: `${finalHandover.laptopModel.manufacturer} ${finalHandover.laptopModel.modelName}`,
        serialNumber: finalHandover.serialNumber,
        price: finalHandover.price,
        dateReceived: finalHandover.completedAt ?? new Date(),
        fullName: finalHandover.employeeTypedName || finalHandover.user.fullName,
        idNumber: finalHandover.idNumber,
        signatureDataUrl: finalHandover.signatureData,
        adminName: finalHandover.administrator?.fullName ?? null,
        agreementVersion: finalHandover.agreementVersion,
        recordId: finalHandover.id,
      });
      await prisma.handoverRecord.update({
        where: { id: finalHandover.id },
        data: { agreementPdf },
      });
    } catch (err) {
      console.error('[handover] failed to render/store agreement PDF:', err);
    }
  }

  await sendHandoverCompletedEmail({
    to: handover.user.email,
    fullName: handover.user.fullName,
    resaleTitle: handover.resale.title,
    modelName: `${handover.laptopModel.manufacturer} ${handover.laptopModel.modelName}`,
    serialNumber: handover.serialNumber,
    recordId: handover.id,
    pdf: agreementPdf,
  });
}

// ADMIN — list handovers for management.
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { resaleId } = req.query as Record<string, string>;
    const records = await prisma.handoverRecord.findMany({
      where: resaleId ? { resaleId } : undefined,
      include: { user: true, laptopModel: true, administrator: true, resale: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(records);
  })
);

// Download the signed purchase-agreement PDF. Available to an administrator or the
// owning employee once the handover is complete. Records completed before PDFs
// were stored are rendered on demand and cached.
router.get(
  '/:registrationId/agreement.pdf',
  requireAuth,
  asyncHandler(async (req, res) => {
    const handover = await prisma.handoverRecord.findUnique({
      where: { registrationId: req.params.registrationId },
      include: { user: true, resale: true, laptopModel: true, administrator: true },
    });
    if (!handover) throw new HttpError(404, 'Handover not found.');
    if (req.user!.role !== 'ADMIN' && handover.userId !== req.user!.id) {
      throw new HttpError(403, 'Access denied.');
    }
    if (!handover.completedAt) {
      throw new HttpError(400, 'The purchase agreement is available after the handover is completed.');
    }

    let pdf: Buffer | null = handover.agreementPdf ? Buffer.from(handover.agreementPdf) : null;
    if (!pdf) {
      pdf = await renderAgreementPdf({
        employeeName: handover.employeeTypedName || handover.user.fullName,
        modelName: `${handover.laptopModel.manufacturer} ${handover.laptopModel.modelName}`,
        serialNumber: handover.serialNumber,
        price: handover.price,
        dateReceived: handover.completedAt,
        fullName: handover.employeeTypedName || handover.user.fullName,
        idNumber: handover.idNumber,
        signatureDataUrl: handover.signatureData,
        adminName: handover.administrator?.fullName ?? null,
        agreementVersion: handover.agreementVersion,
        recordId: handover.id,
      });
      await prisma.handoverRecord.update({ where: { id: handover.id }, data: { agreementPdf: pdf } });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="purchase-agreement-${handover.id}.pdf"`
    );
    res.send(pdf);
  })
);

export default router;
