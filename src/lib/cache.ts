/**
 * Cache helpers built on top of Redis.
 * All functions degrade gracefully: if Redis is unavailable, they fall
 * through to the database silently so the app keeps working.
 */

import { redis } from './redis'
import { db } from './db'

// ── TTLs (seconds) ────────────────────────────────────────────────────────────
const TTL = {
  SESSION: 60,       // token → {userId, expiresAt}
  CHAT_LIST: 30,     // userId → chat list
  USER_SEARCH: 60,   // query  → user list
} as const

// ── Types ─────────────────────────────────────────────────────────────────────

export type CachedSession = {
  id: string
  userId: string
  expiresAt: string // ISO-8601
}

// ── Session ───────────────────────────────────────────────────────────────────

/**
 * Returns the session for `token`, hitting Redis first then falling back to
 * the database. The result is cached in Redis on a DB hit.
 */
export async function getSessionByToken(token: string): Promise<CachedSession | null> {
  // 1. Try cache
  try {
    const cached = await redis.get(`session:${token}`)
    if (cached) return JSON.parse(cached) as CachedSession
  } catch {
    // Redis unavailable — fall through
  }

  // 2. Database
  const session = await db.session.findUnique({ where: { token } })
  if (!session) return null

  const entry: CachedSession = {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt.toISOString(),
  }

  // Only cache if there's remaining lifetime
  const ttl = Math.min(TTL.SESSION, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
  if (ttl > 0) {
    redis.setex(`session:${token}`, ttl, JSON.stringify(entry)).catch(() => {})
  }

  return entry
}

/** Call this whenever a session row is deleted (logout, block, password reset). */
export function invalidateSessionCache(token: string): void {
  redis.del(`session:${token}`).catch(() => {})
}

// ── Chat list ─────────────────────────────────────────────────────────────────

export async function getChatListCache(userId: string): Promise<unknown[] | null> {
  try {
    const cached = await redis.get(`chats:${userId}`)
    if (cached) return JSON.parse(cached) as unknown[]
  } catch {
    // ignore
  }
  return null
}

export function setChatListCache(userId: string, chats: unknown[]): void {
  redis.setex(`chats:${userId}`, TTL.CHAT_LIST, JSON.stringify(chats)).catch(() => {})
}

export function invalidateChatListCache(userId: string): void {
  redis.del(`chats:${userId}`).catch(() => {})
}

// ── User search ───────────────────────────────────────────────────────────────

export async function getUserSearchCache(query: string): Promise<unknown[] | null> {
  try {
    const cached = await redis.get(`search:${query.toLowerCase()}`)
    if (cached) return JSON.parse(cached) as unknown[]
  } catch {
    // ignore
  }
  return null
}

export function setUserSearchCache(query: string, users: unknown[]): void {
  redis.setex(`search:${query.toLowerCase()}`, TTL.USER_SEARCH, JSON.stringify(users)).catch(() => {})
}
