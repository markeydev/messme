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
    const trendDays = 7
    const trendStart = new Date(Date.now() - (trendDays - 1) * 24 * 60 * 60 * 1000)

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
      recentMessages,
      recentStories,
      recentVideos,
      recentRegistrations,
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
      db.message.findMany({ where: { createdAt: { gte: trendStart } }, select: { createdAt: true } }),
      db.story.findMany({ where: { createdAt: { gte: trendStart } }, select: { createdAt: true } }),
      db.clipMeVideo.findMany({ where: { createdAt: { gte: trendStart } }, select: { createdAt: true } }),
      db.user.findMany({ where: { createdAt: { gte: trendStart } }, select: { createdAt: true } }),
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

    const dayLabels = Array.from({ length: trendDays }, (_, idx) => {
      const date = new Date(trendStart)
      date.setDate(trendStart.getDate() + idx)
      return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    })
    const toLabel = (value: Date) => value.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    const countByDay = (items: Date[]) => dayLabels.map(label => items.filter(value => toLabel(value) === label).length)

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
        messme: {
          chatsCount,
          messagesCount,
          storiesCount,
          activeSessionsCount,
        },
        clipme: {
          clipMeVideosCount,
        },
      },
      trends: dayLabels.map((label, idx) => ({
        day: label,
        users: countByDay(recentRegistrations.map(item => item.createdAt))[idx],
        messages: countByDay(recentMessages.map(item => item.createdAt))[idx],
        stories: countByDay(recentStories.map(item => item.createdAt))[idx],
        clipmeVideos: countByDay(recentVideos.map(item => item.createdAt))[idx],
      })),
      suspiciousAccounts: suspiciousAccounts.map(normalizeUser),
      users: recentUsers.map(normalizeUser),
    })
  } catch (error) {
    console.error('Admin panel stats error:', error)
    return NextResponse.json({ error: 'Ошибка загрузки панели' }, { status: 500 })
  }
}
