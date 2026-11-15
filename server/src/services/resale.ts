import crypto from 'crypto';
import { prisma } from '../prisma';
import { HttpError } from '../utils';
import { recordAudit } from './audit';
import { notify } from './notifications';
import {
  sendResultWinnerEmail,
  sendResultNotSelectedEmail,
} from './emails';

// Deterministic, auditable resale resale.
//
// Approach (reproducible):
//  1. Generate a secure random seed and a resale-run id, stored before results.
//  2. For each laptop model, derive a per-model PRNG from the seed.
//  3. Deterministically shuffle the eligible registration ids (Fisher-Yates).
//  4. Select the first N as winners (N = configured quantity), the rest become
//     an ordered waiting list.
//  5. Persist the full ordered result list plus the seed reference.

// mulberry32 PRNG seeded from a 32-bit integer.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(seed: string, salt: string): number {
  const hash = crypto.createHash('sha256').update(`${seed}:${salt}`).digest();
  return hash.readUInt32BE(0);
}

function deterministicShuffle<T>(items: T[], seed: string, salt: string): T[] {
  const rng = mulberry32(seedToInt(seed, salt));
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface PreResaleStats {
  totalRegistrations: number;
  eligibleRegistrations: number;
  ineligibleRegistrations: number;
  excludedRegistrations: number;
  cancelledRegistrations: number;
  models: {
    laptopModelId: string;
    modelName: string;
    quantity: number;
    validRegistrations: number;
    winnersToSelect: number;
  }[];
}

export async function computePreResaleStats(resaleId: string): Promise<PreResaleStats> {
  const resale = await prisma.resale.findUnique({
    where: { id: resaleId },
    include: {
      models: { include: { laptopModel: true } },
      registrations: { include: { modelChoices: true } },
    },
  });
  if (!resale) throw new HttpError(404, 'Resale not found.');

  const regs = resale.registrations;
  const isValid = (r: (typeof regs)[number]) =>
    r.status === 'SUBMITTED' &&
    (r.eligibilityStatus === 'ELIGIBLE' || r.eligibilityStatus === 'OVERRIDDEN');

  const chosenIds = (r: (typeof regs)[number]) =>
    r.modelChoices.length > 0
      ? r.modelChoices.map((c) => c.laptopModelId)
      : r.selectedLaptopModelId
        ? [r.selectedLaptopModelId]
        : [];

  const models = resale.models.map((m) => {
    const valid = regs.filter((r) => isValid(r) && chosenIds(r).includes(m.laptopModelId));
    return {
      laptopModelId: m.laptopModelId,
      modelName: `${m.laptopModel.manufacturer} ${m.laptopModel.modelName}`,
      quantity: m.quantity,
      validRegistrations: valid.length,
      winnersToSelect: Math.min(m.quantity, valid.length),
    };
  });

  return {
    totalRegistrations: regs.length,
    eligibleRegistrations: regs.filter(isValid).length,
    ineligibleRegistrations: regs.filter((r) => r.eligibilityStatus === 'INELIGIBLE').length,
    excludedRegistrations: regs.filter((r) => r.status === 'EXCLUDED').length,
    cancelledRegistrations: regs.filter((r) => r.status === 'CANCELLED').length,
    models,
  };
}

export async function runResale(resaleId: string, adminId: string | null) {
  const resale = await prisma.resale.findUnique({
    where: { id: resaleId },
    include: { models: true, results: true },
  });
  if (!resale) throw new HttpError(404, 'Resale not found.');

  // Guard: prevent accidental double-resale.
  if (resale.results.length > 0) {
    throw new HttpError(
      409,
      'A resale has already been completed for this resale. Existing results cannot be silently overwritten.'
    );
  }
  if (!['OPEN', 'CLOSED', 'SELECTING'].includes(resale.status)) {
    throw new HttpError(400, `This resale cannot be run from status ${resale.status}.`);
  }
  if (resale.models.length === 0) {
    throw new HttpError(400, 'This resale has no laptop models to resale.');
  }

  const seed = crypto.randomBytes(24).toString('hex');
  const resaleRunId = crypto.randomUUID();

  const registrations = await prisma.registration.findMany({
    where: { resaleId },
    include: { modelChoices: true },
  });

  const isValid = (r: (typeof registrations)[number]) =>
    r.status === 'SUBMITTED' &&
    (r.eligibilityStatus === 'ELIGIBLE' || r.eligibilityStatus === 'OVERRIDDEN');

  const validModelIds = new Set(resale.models.map((m) => m.laptopModelId));

  // The models a registration entered for, in the employee's chosen priority
  // order (most-wanted first). Falls back to the single legacy selection when a
  // registration predates multi-model choices. Only models still part of the
  // resale are considered.
  const orderedChoices = (r: (typeof registrations)[number]) => {
    const ids =
      r.modelChoices.length > 0
        ? [...r.modelChoices]
            .sort((a, b) => a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime())
            .map((c) => c.laptopModelId)
        : r.selectedLaptopModelId
          ? [r.selectedLaptopModelId]
          : [];
    return ids.filter((id) => validModelIds.has(id));
  };

  // Fairness: one global random pick order for the whole resale. The random
  // order decides who gets to pick first; each winner then receives the
  // highest-priority laptop they chose that still has stock. This keeps the
  // selection fully random while honouring everyone's stated preferences
  // (random serial dictatorship).
  const eligible = registrations.filter(isValid);
  const pickOrder = deterministicShuffle(
    eligible.map((r) => r.id),
    seed,
    'global-pick-order'
  );
  const regById = new Map(registrations.map((r) => [r.id, r]));

  // Remaining stock per model.
  const capacity: Record<string, number> = {};
  for (const m of resale.models) capacity[m.laptopModelId] = m.quantity;

  // Assign each winner the best available laptop from their priority list.
  const wonModelByReg = new Map<string, string>();
  for (const regId of pickOrder) {
    const r = regById.get(regId);
    if (!r) continue;
    for (const modelId of orderedChoices(r)) {
      if ((capacity[modelId] ?? 0) > 0) {
        capacity[modelId] -= 1;
        wonModelByReg.set(regId, modelId);
        break;
      }
    }
  }

  const winnersByModel: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    for (const modelLink of resale.models) {
      const modelId = modelLink.laptopModelId;
      // Winners of this model, in the random pick order.
      const winnerIds = pickOrder.filter((id) => wonModelByReg.get(id) === modelId);
      winnersByModel[modelId] = winnerIds.length;

      let order = 0;
      for (const regId of winnerIds) {
        const result = await tx.resaleResult.create({
          data: {
            resaleId,
            registrationId: regId,
            laptopModelId: modelId,
            resultType: 'WINNER',
            resultOrder: order,
            randomSeedReference: seed,
            resaleRunId,
          },
        });
        await tx.winnerAssignment.create({
          data: { resaleResultId: result.id, status: 'PENDING' },
        });
        // Record the won model as the registration's selection so downstream
        // handover / pickup / exports reference the laptop actually won.
        await tx.registration.update({
          where: { id: regId },
          data: { status: 'WINNER', selectedLaptopModelId: modelId },
        });
        order += 1;
      }

      // Waiting list: chose this model, didn't win anything, in pick order.
      const waitingIds = pickOrder.filter(
        (id) => !wonModelByReg.has(id) && orderedChoices(regById.get(id)!).includes(modelId)
      );
      order = 0;
      for (const regId of waitingIds) {
        await tx.resaleResult.create({
          data: {
            resaleId,
            registrationId: regId,
            laptopModelId: modelId,
            resultType: 'WAITING_LIST',
            resultOrder: order,
            randomSeedReference: seed,
            resaleRunId,
          },
        });
        await tx.registration.update({
          where: { id: regId },
          data: { status: 'WAITING_LIST' },
        });
        order += 1;
      }
    }

    // Record excluded / ineligible registrations for completeness.
    for (const reg of registrations) {
      if (reg.status === 'EXCLUDED' || reg.eligibilityStatus === 'INELIGIBLE') {
        await tx.resaleResult.create({
          data: {
            resaleId,
            registrationId: reg.id,
            laptopModelId: reg.selectedLaptopModelId ?? resale.models[0].laptopModelId,
            resultType: 'EXCLUDED',
            resultOrder: 0,
            randomSeedReference: seed,
            resaleRunId,
          },
        });
      }
    }

    // Results are always published the moment the resale runs — there is no
    // separate manual publish step.
    const resaleNow = new Date();
    await tx.resale.update({
      where: { id: resaleId },
      data: {
        status: 'RESULTS_PUBLISHED',
        resaleAt: resaleNow,
        publishedAt: new Date(),
        // Running the resale closes registration; keep the timeline accurate.
        ...(resale.closedAt ? {} : { closedAt: resaleNow }),
        ...(resale.registrationCloseAt > resaleNow ? { registrationCloseAt: resaleNow } : {}),
      },
    });
  });

  await recordAudit({
    userId: adminId,
    role: adminId ? 'ADMIN' : 'SYSTEM',
    action: 'RESALE_EXECUTED',
    entityType: 'Resale',
    entityId: resaleId,
    newValue: { resaleRunId, seed, winnersByModel },
  });

  await publishResults(resaleId, adminId);

  return { resaleRunId, seed, winnersByModel };
}

// Publishes results: stamps publishedAt on results, notifies employees, and
// moves the resale to RESULTS_PUBLISHED.
export async function publishResults(resaleId: string, adminId: string | null) {
  const results = await prisma.resaleResult.findMany({
    where: { resaleId },
    include: { registration: { include: { user: true } }, laptopModel: true, resale: true },
  });
  if (results.length === 0) throw new HttpError(400, 'No resale results to publish.');

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.resaleResult.updateMany({
      where: { resaleId, publishedAt: null },
      data: { publishedAt: now },
    });
    await tx.resale.update({
      where: { id: resaleId },
      data: { status: 'RESULTS_PUBLISHED', publishedAt: now },
    });
    // Mark not-selected (excluded) registrations. Registrations that were
    // explicitly excluded keep their EXCLUDED status; others (e.g. ineligible)
    // are marked not selected.
    for (const r of results) {
      if (r.resultType === 'EXCLUDED') {
        await tx.registration.update({
          where: { id: r.registrationId },
          data: { status: r.registration.status === 'EXCLUDED' ? 'EXCLUDED' : 'NOT_SELECTED' },
        });
      }
    }
  });

  await Promise.all(
    results.map((r) => {
      if (r.resultType === 'WINNER') {
        return Promise.all([
          notify({
            userId: r.registration.userId,
            type: 'SELECTED_WINNER',
            title: 'You have been selected!',
            message: `Congratulations! You were selected in "${r.resale.title}" for the ${r.laptopModel.manufacturer} ${r.laptopModel.modelName}. Acceptance instructions are available.`,
            resaleId,
            registrationId: r.registrationId,
            actionUrl: `/pickup/${r.registrationId}`,
          }),
          sendResultWinnerEmail({
            to: r.registration.user.email,
            fullName: r.registration.user.fullName,
            resaleTitle: r.resale.title,
            modelName: `${r.laptopModel.manufacturer} ${r.laptopModel.modelName}`,
            registrationId: r.registrationId,
          }),
        ]);
      }
      if (r.resultType === 'WAITING_LIST') {
        return Promise.all([
          notify({
            userId: r.registration.userId,
            type: 'ADDED_WAITING_LIST',
            title: 'You are on the waiting list',
            message: `You were placed on the waiting list (position ${r.resultOrder + 1}) for "${r.resale.title}".`,
            resaleId,
            registrationId: r.registrationId,
            actionUrl: `/results/${resaleId}`,
          }),
          // Runner-ups get the not-selected email; they only hear again if promoted.
          sendResultNotSelectedEmail({
            to: r.registration.user.email,
            fullName: r.registration.user.fullName,
            resaleTitle: r.resale.title,
            resaleId,
          }),
        ]);
      }
      return Promise.all([
        notify({
          userId: r.registration.userId,
          type: 'NOT_SELECTED',
          title: 'Resale results published',
          message: `The results for "${r.resale.title}" have been published.`,
          resaleId,
          registrationId: r.registrationId,
          actionUrl: `/results/${resaleId}`,
        }),
        sendResultNotSelectedEmail({
          to: r.registration.user.email,
          fullName: r.registration.user.fullName,
          resaleTitle: r.resale.title,
          resaleId,
        }),
      ]);
    })
  );

  await recordAudit({
    userId: adminId,
    role: adminId ? 'ADMIN' : 'SYSTEM',
    action: 'RESULTS_PUBLISHED',
    entityType: 'Resale',
    entityId: resaleId,
  });
}
