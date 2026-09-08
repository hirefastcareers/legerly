import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function pooledUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("pgbouncer=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}pgbouncer=true`;
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: pooledUrl() ? { db: { url: pooledUrl() } } : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
