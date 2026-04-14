import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

    // Find session
    const session = await db.session.findUnique({
      where: { token }
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Сессия истекла' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query || query.length < 2) {
      return NextResponse.json({ users: [] })
    }

    // Search users by username or email
    const users = await db.user.findMany({
      where: {
        AND: [
          { id: { not: session.userId } }, // Exclude current user
          {
            OR: [
              { username: { contains: query } },
              { email: { contains: query } }
            ]
          }
        ]
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        isBadgeVerified: true,
      },
      take: 10
    })

    return NextResponse.json({
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        avatarUrl: u.avatarUrl ?? null,
        isBadgeVerified: u.isBadgeVerified,
      }))
    })
  } catch (error) {
    console.error('Search users error:', error)
    return NextResponse.json(
      { error: 'Ошибка при поиске пользователей' },
      { status: 500 }
    )
  }
}
