import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils';
import { notify } from '../services/notifications';

const router = Router();

// Current user's notifications.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const unread = notifications.filter((n) => !n.isRead).length;
    res.json({ notifications, unread });
  })
);

router.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!n || n.userId !== req.user!.id) throw new HttpError(404, 'Notification not found.');
    const updated = await prisma.notification.update({
      where: { id: n.id },
      data: { isRead: true, readAt: new Date() },
    });
    res.json(updated);
  })
);

router.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ ok: true });
  })
);

// ADMIN — preview & send a manual notification to a user or a whole resale.
router.post(
  '/send',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { userId, resaleId, title, message, actionUrl } = z
      .object({
        userId: z.string().optional(),
        resaleId: z.string().optional(),
        title: z.string().min(1),
        message: z.string().min(1),
        actionUrl: z.string().optional(),
      })
      .parse(req.body);

    if (!userId && !resaleId) {
      throw new HttpError(400, 'Provide a userId or a resaleId.');
    }

    let recipients: string[] = [];
    if (userId) recipients = [userId];
    else {
      const regs = await prisma.registration.findMany({
        where: { resaleId, status: { notIn: ['CANCELLED'] } },
        select: { userId: true },
      });
      recipients = [...new Set(regs.map((r) => r.userId))];
    }

    await Promise.all(
      recipients.map((uid) =>
        notify({
          userId: uid,
          type: 'ADMIN_UPDATE',
          title,
          message,
          resaleId: resaleId ?? null,
          actionUrl: actionUrl ?? null,
        })
      )
    );
    res.json({ ok: true, sent: recipients.length });
  })
);

export default router;
