import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
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
      where: {
        chatId_userId: {
          chatId,
          userId: session.userId,
        },
      },
      select: { id: true },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Нет доступа к этому чату' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const pinned = !!body?.pinned

    const message = await db.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true },
    })
    if (!message || message.chatId !== chatId) {
      return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
    }

    const updated = await db.message.update({
      where: { id: messageId },
      data: {
        isPinned: pinned,
        pinnedAt: pinned ? new Date() : null,
      },
      select: { id: true, isPinned: true, pinnedAt: true },
    })

    return NextResponse.json({
      messageId: updated.id,
      isPinned: updated.isPinned,
      pinnedAt: updated.pinnedAt ? updated.pinnedAt.toISOString() : null,
    })
  } catch (error) {
    console.error('Toggle message pin error:', error)
    return NextResponse.json({ error: 'Ошибка при изменении закрепа сообщения' }, { status: 500 })
  }
}
