import { prisma } from '../prisma';

interface AuditInput {
  userId?: string | null;
  role?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

// Central audit-logging helper. Serializes previous/new values to JSON strings.
export async function recordAudit(input: AuditInput) {
  // Attribute the entry to the ACTUAL actor's role so the administrative/user
  // audit views split correctly, regardless of what the caller passed. This
  // ensures e.g. an employee declining or approving a handover is recorded as a
  // user action, not an administrative one.
  let role = input.role ?? null;
  if (input.userId) {
    const actor = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { role: true },
    });
    if (actor) role = actor.role;
  }

  return prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      previousValue:
        input.previousValue === undefined ? null : JSON.stringify(input.previousValue),
      newValue: input.newValue === undefined ? null : JSON.stringify(input.newValue),
      reason: input.reason ?? null,
    },
  });
}
