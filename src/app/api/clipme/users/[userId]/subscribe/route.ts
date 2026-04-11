import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/clipme'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const { userId } = await params
    if (userId === session.userId) return NextResponse.json({ error: 'Нельзя подписаться на себя' }, { status: 400 })

    const exists = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })

    const existing = await db.clipMeSubscription.findUnique({
      where: { followerId_followingId: { followerId: session.userId, followingId: userId } },
      select: { id: true },
    })

    if (existing) {
      await db.clipMeSubscription.delete({ where: { id: existing.id } })
    } else {
      await db.clipMeSubscription.create({
        data: {
          followerId: session.userId,
          followingId: userId,
        },
      })
    }

    const followersCount = await db.clipMeSubscription.count({ where: { followingId: userId } })
    return NextResponse.json({ subscribed: !existing, followersCount })
  } catch (error) {
    console.error('ClipMe subscribe error:', error)
    return NextResponse.json({ error: 'Ошибка подписки' }, { status: 500 })
  }
}
