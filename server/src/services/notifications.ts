import { prisma } from '../prisma';

interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  resaleId?: string | null;
  registrationId?: string | null;
  actionUrl?: string | null;
}

// In-app notification service.
//
// This is deliberately a thin abstraction so that additional channels (Email,
// Microsoft Teams, SMS, Power Automate, Microsoft Graph) can be added later by
// implementing the same `dispatch` contract and fanning out. For now only the
// in-app channel is persisted.
export interface NotificationChannel {
  send(input: NotificationInput): Promise<void>;
}

class InAppChannel implements NotificationChannel {
  async send(input: NotificationInput): Promise<void> {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        resaleId: input.resaleId ?? null,
        registrationId: input.registrationId ?? null,
        actionUrl: input.actionUrl ?? null,
      },
    });
  }
}

const channels: NotificationChannel[] = [new InAppChannel()];

export async function notify(input: NotificationInput): Promise<void> {
  await Promise.all(channels.map((c) => c.send(input)));
}

export async function notifyMany(inputs: NotificationInput[]): Promise<void> {
  await Promise.all(inputs.map((i) => notify(i)));
}
