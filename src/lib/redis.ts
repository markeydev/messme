import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as { redis: Redis | undefined }

function createClient(): Redis {
  const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
  })
  client.on('error', (err: Error) => {
    // Non-critical — app keeps running without cache
    console.error('[Redis] error:', err.message)
  })
  return client
}

export const redis: Redis = globalForRedis.redis ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis
