import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/clipme'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    if (q.length < 1) return NextResponse.json({ channels: [] })

    const channels = await db.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
        clipMeVideos: { some: {} },
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        isBadgeVerified: true,
      },
      orderBy: { username: 'asc' },
      take: 25,
    })

    return NextResponse.json({ channels })
  } catch (error) {
    console.error('ClipMe channel search error:', error)
    return NextResponse.json({ error: 'Ошибка поиска каналов' }, { status: 500 })
  }
}
