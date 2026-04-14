import { randomUUID } from 'crypto'
import { db } from '@/lib/db'

const ADMINBOT_USERNAME = 'adminbot'
const ADMINBOT_EMAIL = 'adminbot@messme.local'

export async function ensureAdminbotUser() {
  const existing = await db.user.findUnique({
    where: { username: ADMINBOT_USERNAME },
    select: { id: true, isBadgeVerified: true, isVerified: true },
  })

  if (!existing) {
    await db.user.create({
      data: {
        id: randomUUID(),
        username: ADMINBOT_USERNAME,
        email: ADMINBOT_EMAIL,
        passwordHash: randomUUID(),
        isVerified: true,
        isBadgeVerified: true,
        isAdmin: true,
      },
    })
    return
  }

  if (!existing.isBadgeVerified || !existing.isVerified) {
    await db.user.update({
      where: { id: existing.id },
      data: { isBadgeVerified: true, isVerified: true },
    })
  }
}
