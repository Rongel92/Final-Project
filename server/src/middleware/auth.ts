import { NextFunction, Request, Response } from 'express';
import { prisma } from '../prisma';
import { HttpError } from '../utils';

// Authentication.
//
// There is no SSO: the sign-in page lists the users in the database and the
// chosen user's id is stored in a signed session cookie (`req.session.userId`,
// see routes/auth.ts). Route handlers only ever read `req.user`.

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    // Set once a user signs in. Identifies req.user.
    userId?: string;
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const userId = req.session?.userId;
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user && user.isActive) {
        req.user = { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, 'Authentication required.');
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, 'Authentication required.');
  if (req.user.role !== 'ADMIN') throw new HttpError(403, 'Administrator access required.');
  next();
}
