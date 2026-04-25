import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chatId } = await params
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }

    const session = await db.session.findUnique({ where: { token } })
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const archived = !!body?.archived

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

    const updated = await db.chatMember.update({
      where: { chatId_userId: { chatId, userId: session.userId } },
      data: {
        isArchived: archived,
        archivedAt: archived ? new Date() : null,
      },
      select: {
        isArchived: true,
        archivedAt: true,
      },
    })

    return NextResponse.json({
      archived: updated.isArchived,
      archivedAt: updated.archivedAt ? updated.archivedAt.toISOString() : null,
    })
  } catch (error) {
    console.error('Toggle chat archive error:', error)
    return NextResponse.json({ error: 'Ошибка при изменении архива чата' }, { status: 500 })
  }
}
