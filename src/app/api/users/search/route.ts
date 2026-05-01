import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionByToken, getUserSearchCache, setUserSearchCache } from '@/lib/cache'

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
    const session = await getSessionByToken(token)

    if (!session || new Date(session.expiresAt) < new Date()) {
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

    // Return cached results for this query if available
    const cached = await getUserSearchCache(query)
    if (cached) return NextResponse.json({ users: cached })

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

    const result = users.map(u => ({
      id: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl ?? null,
      isBadgeVerified: u.isBadgeVerified,
    }))

    setUserSearchCache(query, result)

    return NextResponse.json({ users: result })
  } catch (error) {
    console.error('Search users error:', error)
    return NextResponse.json(
      { error: 'Ошибка при поиске пользователей' },
      { status: 500 }
    )
  }
}
