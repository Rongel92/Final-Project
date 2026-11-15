import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils';

const router = Router();

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(200, Math.max(10, Number(q.pageSize ?? 50)));
    const where: any = {};
    const and: any[] = [];
    if (q.entityType) where.entityType = q.entityType;
    if (q.action) where.action = q.action;
    if (q.entityId) where.entityId = q.entityId;

    // Split the log into administrative vs user activity by the actor's role.
    if (q.roleGroup === 'user') {
      where.role = 'EMPLOYEE';
    } else if (q.roleGroup === 'admin') {
      // Everything that is not an employee action (admins + system tasks).
      and.push({ OR: [{ role: { not: 'EMPLOYEE' } }, { role: null }] });
    }

    if (q.search && q.search.trim()) {
      const term = q.search.trim();
      const terms = [term];
      and.push({
        OR: terms.flatMap((t) => [
          { action: { contains: t } },
          { entityType: { contains: t } },
          { entityId: { contains: t } },
          { newValue: { contains: t } },
          { previousValue: { contains: t } },
          { reason: { contains: t } },
          { user: { fullName: { contains: t } } },
          { user: { email: { contains: t } } },
        ]),
      });
    }

    if (and.length) where.AND = and;

    const dir = q.dir === 'asc' ? 'asc' : 'desc';
    const orderBy: any =
      q.sort === 'action'
        ? { action: dir }
        : q.sort === 'entity'
          ? { entityType: dir }
          : q.sort === 'actor'
            ? { user: { fullName: dir } }
            : { createdAt: dir };

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: true },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({ total, page, pageSize, rows });
  })
);

export default router;
