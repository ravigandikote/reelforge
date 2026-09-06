import IORedis from 'ioredis'
import { getEnv } from '@reelforge/shared/env'

/**
 * BullMQ requires maxRetriesPerRequest = null on the connection it blocks on,
 * otherwise long-running workers drop out when Redis is briefly slow.
 */
export function createConnection(): IORedis {
  return new IORedis(getEnv().REDIS_URL, { maxRetriesPerRequest: null })
}

export const connection = createConnection()
