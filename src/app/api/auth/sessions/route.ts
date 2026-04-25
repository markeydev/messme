import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }

    const currentSession = await db.session.findUnique({
      where: { token },
      select: { id: true, userId: true, expiresAt: true },
    })
    if (!currentSession || currentSession.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const sessions = await db.session.findMany({
      where: { userId: currentSession.userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
      },
    })

    return NextResponse.json({
      sessions: sessions.map(session => ({
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        isCurrent: session.id === currentSession.id,
      })),
    })
  } catch (error) {
    console.error('Get sessions error:', error)
    return NextResponse.json({ error: 'Ошибка при получении сессий' }, { status: 500 })
  }
}
