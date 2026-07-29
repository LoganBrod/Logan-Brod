import { PrismaClient } from "@prisma/client";

/**
 * One client per process. Next.js hot-reloads modules in dev, and a fresh
 * PrismaClient per reload exhausts the Postgres connection pool within a few
 * edits, so the instance is parked on globalThis and reused.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
