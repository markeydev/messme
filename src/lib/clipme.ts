import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import type { ClipMePrivacy } from '@prisma/client'

export async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

export async function canAccessClipVideo(viewerId: string, ownerId: string, privacy: ClipMePrivacy) {
  if (viewerId === ownerId) return true
  if (privacy === 'PUBLIC') return true
  if (privacy === 'PRIVATE') return false
  const subscription = await db.clipMeSubscription.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: ownerId } },
    select: { id: true },
  })
  return !!subscription
}
