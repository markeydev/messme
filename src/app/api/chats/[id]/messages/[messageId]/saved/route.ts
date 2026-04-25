import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { id: chatId, messageId } = await params
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }

    const session = await db.session.findUnique({ where: { token } })
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
      select: { id: true },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Нет доступа к этому чату' }, { status: 403 })
    }

    const message = await db.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true },
    })
    if (!message || message.chatId !== chatId) {
      return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
    }

    const existing = await db.messageSave.findUnique({
      where: { messageId_userId: { messageId, userId: session.userId } },
      select: { id: true },
    })

    if (existing) {
      await db.messageSave.delete({ where: { messageId_userId: { messageId, userId: session.userId } } })
      return NextResponse.json({ messageId, saved: false })
    }

    await db.messageSave.create({
      data: { messageId, userId: session.userId },
      select: { id: true },
    })
    return NextResponse.json({ messageId, saved: true })
  } catch (error) {
    console.error('Toggle message saved error:', error)
    return NextResponse.json({ error: 'Ошибка при обновлении избранного' }, { status: 500 })
  }
}
