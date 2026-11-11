import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/config/env";

export type Db = PrismaClient;
/** The client handed to work inside an interactive transaction. */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const globalForPrisma = globalThis as unknown as { petiPrisma?: PrismaClient };

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 10 }) });
}

/** One client per process (and one across dev hot reloads). */
export function getPrisma(): PrismaClient {
  globalForPrisma.petiPrisma ??= createPrismaClient(getEnv().DATABASE_URL);
  return globalForPrisma.petiPrisma;
}
