import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hasAdminAccess } from '@/lib/admin'
import { getAdminByPanelToken } from '@/lib/admin-panel-auth'

export async function GET(request: NextRequest) {
  try {
    const panelToken = request.nextUrl.searchParams.get('token') ?? ''
    if (!panelToken) return NextResponse.json({ error: 'Требуется токен панели' }, { status: 401 })

    const admin = await getAdminByPanelToken(panelToken)
    if (!admin) return NextResponse.json({ error: 'Недействительная или истекшая ссылка' }, { status: 401 })

    const now = new Date()
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [
      usersCount,
      chatsCount,
      messagesCount,
      storiesCount,
      clipMeVideosCount,
      activeSessionsCount,
      blockedUsersCount,
      badgeVerifiedCount,
      newUsers24hCount,
      suspiciousAccounts,
      recentUsers,
    ] = await Promise.all([
      db.user.count(),
      db.chat.count(),
      db.message.count(),
      db.story.count(),
      db.clipMeVideo.count(),
      db.session.count({ where: { expiresAt: { gt: now } } }),
      db.user.count({ where: { isBlocked: true } }),
      db.user.count({ where: { isBadgeVerified: true } }),
      db.user.count({ where: { createdAt: { gte: last24h } } }),
      db.user.findMany({
        where: {
          OR: [
            { isBlocked: true },
            { isVerified: false },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          username: true,
          email: true,
          avatarUrl: true,
          isVerified: true,
          isBadgeVerified: true,
          isBlocked: true,
          isAdmin: true,
          createdAt: true,
        },
      }),
      db.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          username: true,
          email: true,
          avatarUrl: true,
          isVerified: true,
          isBadgeVerified: true,
          isBlocked: true,
          isAdmin: true,
          createdAt: true,
        },
      }),
    ])

    const normalizeUser = (u: {
      id: string
      username: string
      email: string
      avatarUrl: string | null
      isVerified: boolean
      isBadgeVerified: boolean
      isBlocked: boolean
      isAdmin: boolean
      createdAt: Date
    }) => ({
      ...u,
      isAdmin: hasAdminAccess(u),
    })

    return NextResponse.json({
      stats: {
        usersCount,
        chatsCount,
        messagesCount,
        storiesCount,
        clipMeVideosCount,
        activeSessionsCount,
        blockedUsersCount,
        badgeVerifiedCount,
        newUsers24hCount,
      },
      suspiciousAccounts: suspiciousAccounts.map(normalizeUser),
      users: recentUsers.map(normalizeUser),
    })
  } catch (error) {
    console.error('Admin panel stats error:', error)
    return NextResponse.json({ error: 'Ошибка загрузки панели' }, { status: 500 })
  }
}
