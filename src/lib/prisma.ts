import { PrismaClient } from "@prisma/client";

// グローバルで単一のインスタンスを保持
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// 既存のインスタンスがあればそれを使用し、なければ新規作成
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}