import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hasAdminAccess } from '@/lib/admin'
import { MAX_PROFILE_BIO_LENGTH } from '@/lib/product-config'
import { getSessionByToken, invalidateSessionCache } from '@/lib/cache'

async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await getSessionByToken(token)
  if (!session || new Date(session.expiresAt) < new Date()) return null
  return session
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      )
    }

    // Find session with user
    const session = await getSessionByToken(token)

    if (!session || new Date(session.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'Сессия истекла' },
        { status: 401 }
      )
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        bio: true,
        linkedMessmeChannelId: true,
        clipMeBio: true,
        isBadgeVerified: true,
        isAdmin: true,
        isBlocked: true,
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Сессия истекла' },
        { status: 401 }
      )
    }

    if (user.isBlocked) {
      await db.session.delete({ where: { token } }).catch(() => {})
      invalidateSessionCache(token)
      return NextResponse.json(
        { error: 'Аккаунт заблокирован' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
        bio: user.bio ?? null,
        linkedMessmeChannelId: user.linkedMessmeChannelId ?? null,
        clipMeBio: user.clipMeBio ?? null,
        isBadgeVerified: user.isBadgeVerified,
        isAdmin: hasAdminAccess(user),
        isBlocked: user.isBlocked,
      }
    })
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json(
      { error: 'Ошибка при получении данных пользователя' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await request.json()
    const { username, avatarUrl, bio, linkedMessmeChannelId } = body

    if (username !== undefined) {
      if (typeof username !== 'string' || username.trim().length < 2) {
        return NextResponse.json({ error: 'Имя слишком короткое (минимум 2 символа)' }, { status: 400 })
      }
      // Check uniqueness (exclude self)
      const existing = await db.user.findFirst({
        where: { username: username.trim(), NOT: { id: session.userId } }
      })
      if (existing) {
        return NextResponse.json({ error: 'Это имя уже занято' }, { status: 409 })
      }
    }

    const currentUser = await db.user.findUnique({
      where: { id: session.userId },
      select: { isBlocked: true },
    })
    if (currentUser?.isBlocked) {
      return NextResponse.json({ error: 'Аккаунт заблокирован' }, { status: 403 })
    }

    let nextLinkedChannelId: string | null | undefined = undefined
    if (linkedMessmeChannelId !== undefined) {
      if (linkedMessmeChannelId === null || linkedMessmeChannelId === '') {
        nextLinkedChannelId = null
      } else if (typeof linkedMessmeChannelId === 'string') {
        const ownChannel = await db.chat.findFirst({
          where: {
            id: linkedMessmeChannelId,
            ownerId: session.userId,
            isPersonalChannel: true,
          },
          select: { id: true },
        })
        if (!ownChannel) {
          return NextResponse.json({ error: 'Можно привязать только свой личный канал' }, { status: 400 })
        }
        nextLinkedChannelId = ownChannel.id
      } else {
        return NextResponse.json({ error: 'Некорректный канал для привязки' }, { status: 400 })
      }
    }

    const updated = await db.user.update({
      where: { id: session.userId },
      data: {
        ...(username !== undefined ? { username: username.trim() } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl ?? null } : {}),
        ...(bio !== undefined ? { bio: typeof bio === 'string' ? bio.trim().slice(0, MAX_PROFILE_BIO_LENGTH) || null : null } : {}),
        ...(nextLinkedChannelId !== undefined ? { linkedMessmeChannelId: nextLinkedChannelId } : {}),
      },
      select: { id: true, username: true, email: true, avatarUrl: true, bio: true, linkedMessmeChannelId: true, clipMeBio: true, isBadgeVerified: true, isAdmin: true, isBlocked: true }
    })

    return NextResponse.json({
      user: {
        ...updated,
        isAdmin: hasAdminAccess(updated),
      }
    })
  } catch (error) {
    console.error('Update profile error:', error)
    return NextResponse.json({ error: 'Ошибка при обновлении профиля' }, { status: 500 })
  }
}
