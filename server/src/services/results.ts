import { prisma } from '../prisma';
import { HttpError } from '../utils';
import { recordAudit } from './audit';
import { notify } from './notifications';
import { sendRunnerUpPromotedEmail } from './emails';

// Changes a winner assignment status (accepted / declined / etc.) and, when a
// winner is declined / removed, promotes the next waiting-list entry. Shared by
// the results route and the handover decline flow.
export async function changeWinnerAssignmentStatus(
  assignmentId: string,
  status: string,
  actorId: string | null,
  reason?: string
) {
  const assignment = await prisma.winnerAssignment.findUnique({
    where: { id: assignmentId },
    include: { resaleResult: { include: { registration: true, laptopModel: true, resale: true } } },
  });
  if (!assignment) throw new HttpError(404, 'Winner assignment not found.');

  const updated = await prisma.winnerAssignment.update({
    where: { id: assignment.id },
    data: { status, respondedAt: new Date() },
  });

  await recordAudit({
    userId: actorId,
    role: actorId ? 'ADMIN' : 'SYSTEM',
    action: 'WINNER_STATUS_CHANGED',
    entityType: 'WinnerAssignment',
    entityId: assignment.id,
    previousValue: { status: assignment.status },
    newValue: { status },
    reason,
  });

  // If the winner declines / is removed, reflect it on their registration and
  // promote the next waiting-list entry (if any).
  if (['DECLINED', 'INELIGIBLE', 'CANCELLED'].includes(status)) {
    const modelId = assignment.resaleResult.laptopModelId;
    const resaleId = assignment.resaleResult.resaleId;

    // A declined winner is shown as "Declined"; removed/ineligible as "Not selected".
    await prisma.registration.update({
      where: { id: assignment.resaleResult.registrationId },
      data: { status: status === 'DECLINED' ? 'DECLINED' : 'NOT_SELECTED' },
    });

    // Promote the next eligible waiting-list entry. Skip any whose registration
    // has already won another model, or was cancelled / declined, so a person
    // still only ever wins one laptop.
    const waitingCandidates = await prisma.resaleResult.findMany({
      where: { resaleId, laptopModelId: modelId, resultType: 'WAITING_LIST' },
      orderBy: { resultOrder: 'asc' },
      include: { registration: { include: { user: true } } },
    });
    const nextWaiting = waitingCandidates.find(
      (w) => w.registration.status === 'WAITING_LIST'
    );
    if (nextWaiting) {
      await prisma.$transaction(async (tx) => {
        await tx.resaleResult.update({
          where: { id: nextWaiting.id },
          data: { resultType: 'WINNER' },
        });
        await tx.winnerAssignment.create({
          data: {
            resaleResultId: nextWaiting.id,
            status: 'PENDING',
            replacementFromResultId: assignment.resaleResultId,
          },
        });
        await tx.registration.update({
          where: { id: nextWaiting.registrationId },
          data: { status: 'WINNER', selectedLaptopModelId: modelId },
        });
      });
      await recordAudit({
        userId: actorId,
        role: actorId ? 'ADMIN' : 'SYSTEM',
        action: 'WAITING_LIST_REPLACEMENT',
        entityType: 'ResaleResult',
        entityId: nextWaiting.id,
        reason: 'Waiting-list replacement after a declined winner.',
      });
      await notify({
        userId: nextWaiting.registration.userId,
        type: 'WINNER_REPLACEMENT',
        title: 'You have been selected from the waiting list',
        message: `A spot opened up in "${assignment.resaleResult.resale.title}" and you have been selected for the ${assignment.resaleResult.laptopModel.manufacturer} ${assignment.resaleResult.laptopModel.modelName}.`,
        resaleId,
        registrationId: nextWaiting.registrationId,
        actionUrl: `/pickup/${nextWaiting.registrationId}`,
      });
      await sendRunnerUpPromotedEmail({
        to: nextWaiting.registration.user.email,
        fullName: nextWaiting.registration.user.fullName,
        resaleTitle: assignment.resaleResult.resale.title,
        modelName: `${assignment.resaleResult.laptopModel.manufacturer} ${assignment.resaleResult.laptopModel.modelName}`,
        registrationId: nextWaiting.registrationId,
      });
    }
  }

  return updated;
}
