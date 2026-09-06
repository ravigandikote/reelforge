import { PrismaClient } from '../generated/client/index.js'
import { resolveDatabaseUrl } from './paths.js'

/**
 * One PrismaClient per process. Next.js dev reloads modules on every edit, so
 * the instance is parked on globalThis to avoid exhausting SQLite connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: resolveDatabaseUrl() } },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
