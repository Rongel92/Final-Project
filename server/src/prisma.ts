import { PrismaClient } from '@prisma/client';

// Single shared Prisma client instance for the whole server process.
// Globally omit the laptop image blob so list/include queries never ship the
// bytes; the image-serving route selects it explicitly.
export const prisma = new PrismaClient({
  omit: { laptopModel: { imageData: true } },
});
