import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { asyncHandler, HttpError } from '../utils';

const router = Router();

// Accounts offered on the sign-in page: every active user, admins first.
router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, email: true, role: true, department: true },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
    res.json(users);
  })
);

// Sign in as the chosen user (no password / SSO).
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new HttpError(404, 'User not found.');
    // Fresh session id on sign-in (avoids session fixation).
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve()))
    );
    req.session.userId = user.id;
    res.json(user);
  })
);

// End the session and return to the sign-in page.
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('resale.sid');
    res.redirect('/login');
  });
});

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    return res.json(user);
  })
);

export default router;
