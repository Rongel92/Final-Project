import { Resale, Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export interface EligibilityResult {
  status: 'ELIGIBLE' | 'INELIGIBLE' | 'REVIEW';
  reason: string;
  nextEligibleAt?: Date | null;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Core eligibility calculation. All critical eligibility logic lives on the
// server (never trusted from the frontend).
//
// Two policy modes are supported per resale:
//  - PARTICIPATION: an employee may participate only once during the cooldown.
//  - PURCHASE: only employees who won or purchased a laptop are restricted.
//
// Eligibility considers: employee id, previous registration dates, previous
// winner status and previous handover completion date within the cooldown window.
export async function evaluateEligibility(
  userId: string,
  resale: Pick<Resale, 'id' | 'cooldownMonths' | 'eligibilityMode'>
): Promise<EligibilityResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { status: 'REVIEW', reason: 'Employee record not found.' };
  if (!user.isActive) {
    return { status: 'REVIEW', reason: 'Employee record requires administrator review.' };
  }

  // Administrator manual override takes precedence over automatic cooldown rules.
  if (user.manualEligibility === 'INELIGIBLE') {
    return {
      status: 'INELIGIBLE',
      reason: 'An administrator has marked you as not eligible to participate.',
    };
  }

  const now = new Date();
  const windowStart = addMonths(now, -resale.cooldownMonths);

  // Already registered in this resale?
  const existing = await prisma.registration.findFirst({
    where: {
      userId,
      resaleId: resale.id,
      status: { notIn: ['CANCELLED'] },
    },
  });
  if (existing) {
    return { status: 'INELIGIBLE', reason: 'You are already registered in this resale.' };
  }

  // Administrator has explicitly marked this user eligible — bypass cooldown.
  if (user.manualEligibility === 'ELIGIBLE') {
    return { status: 'ELIGIBLE', reason: 'Eligible to participate.' };
  }

  const history = await prisma.participationHistory.findMany({
    where: { userId, participationDate: { gte: windowStart } },
    orderBy: { participationDate: 'desc' },
  });

  if (resale.eligibilityMode === 'PURCHASE') {
    const restrictive = history.find((h) => h.winner || h.purchaseCompleted);
    if (restrictive) {
      const nextEligibleAt =
        restrictive.nextEligibleAt ?? addMonths(restrictive.participationDate, resale.cooldownMonths);
      return {
        status: 'INELIGIBLE',
        reason: `You previously received or purchased a laptop and are not eligible until ${nextEligibleAt.toLocaleDateString()}.`,
        nextEligibleAt,
      };
    }
    return { status: 'ELIGIBLE', reason: 'Eligible to participate.' };
  }

  // PARTICIPATION mode: any participation inside the window blocks re-entry.
  const recent = history[0];
  if (recent) {
    const nextEligibleAt =
      recent.nextEligibleAt ?? addMonths(recent.participationDate, resale.cooldownMonths);
    if (nextEligibleAt > now) {
      return {
        status: 'INELIGIBLE',
        reason: `You participated recently and are not eligible until ${nextEligibleAt.toLocaleDateString()}.`,
        nextEligibleAt,
      };
    }
  }

  return { status: 'ELIGIBLE', reason: 'Eligible to participate.' };
}

// Records a participation history entry, computing the next eligible date from
// the resale cooldown.
export async function recordParticipation(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    resaleId: string;
    registrationId: string;
    cooldownMonths: number;
    winner?: boolean;
    purchaseCompleted?: boolean;
    handoverCompletedAt?: Date | null;
  }
) {
  const nextEligibleAt = addMonths(new Date(), params.cooldownMonths);
  return tx.participationHistory.create({
    data: {
      userId: params.userId,
      resaleId: params.resaleId,
      registrationId: params.registrationId,
      winner: params.winner ?? false,
      purchaseCompleted: params.purchaseCompleted ?? false,
      handoverCompletedAt: params.handoverCompletedAt ?? null,
      nextEligibleAt,
    },
  });
}
