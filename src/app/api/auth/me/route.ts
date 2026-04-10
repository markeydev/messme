import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
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
    const session = await db.session.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            avatarUrl: true,
          }
        }
      }
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Сессия истекла' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      user: {
        id: session.user.id,
        username: session.user.username,
        email: session.user.email,
        avatarUrl: session.user.avatarUrl ?? null,
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
    const { username, avatarUrl } = body

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

    const updated = await db.user.update({
      where: { id: session.userId },
      data: {
        ...(username !== undefined ? { username: username.trim() } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl ?? null } : {}),
      },
      select: { id: true, username: true, email: true, avatarUrl: true }
    })

    return NextResponse.json({ user: updated })
  } catch (error) {
    console.error('Update profile error:', error)
    return NextResponse.json({ error: 'Ошибка при обновлении профиля' }, { status: 500 })
  }
}
