import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function DELETE(request: NextRequest) {
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

    const deleted = await db.session.deleteMany({
      where: {
        userId: currentSession.userId,
        id: { not: currentSession.id },
      },
    })

    return NextResponse.json({ success: true, deletedCount: deleted.count })
  } catch (error) {
    console.error('Delete other sessions error:', error)
    return NextResponse.json({ error: 'Ошибка при завершении сессий' }, { status: 500 })
  }
}
