import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
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

    if (currentSession.id === sessionId) {
      return NextResponse.json({ error: 'Текущую сессию нельзя завершить здесь' }, { status: 400 })
    }

    const target = await db.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    })
    if (!target || target.userId !== currentSession.userId) {
      return NextResponse.json({ error: 'Сессия не найдена' }, { status: 404 })
    }

    await db.session.delete({ where: { id: sessionId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete session error:', error)
    return NextResponse.json({ error: 'Ошибка при завершении сессии' }, { status: 500 })
  }
}
