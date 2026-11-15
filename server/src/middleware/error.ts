import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed.', details: err.flatten() });
  }
  // Prisma unique-constraint violation.
  const anyErr = err as { code?: string; message?: string };
  if (anyErr?.code === 'P2002') {
    return res.status(409).json({ error: 'A record with these details already exists.' });
  }
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error.' });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found.' });
}
