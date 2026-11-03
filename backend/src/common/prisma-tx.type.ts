import type { Prisma, PrismaClient } from '@prisma/client';

// A bare PrismaService or the `tx` handed to a $transaction callback — services that must
// compose into a caller's transaction (stock movements, document series) take this explicitly
// rather than owning their own PrismaService, so the caller controls the transaction boundary.
export type PrismaTx = PrismaClient | Prisma.TransactionClient;
