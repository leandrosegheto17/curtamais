import { PrismaClient } from "@prisma/client";

// Singleton do Prisma Client (evita esgotar conexões em dev com hot-reload
// do Next.js — padrão recomendado pela documentação do Prisma).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
