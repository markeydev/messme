import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chatId } = await params
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const session = await db.session.findUnique({ where: { token } })
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const chat = await db.chat.findUnique({ where: { id: chatId } })
    if (!chat) return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
    if (!chat.isGroup) return NextResponse.json({ error: 'Не групповой чат' }, { status: 400 })

    // Only group owner can edit settings
    if (chat.ownerId !== session.userId) {
      return NextResponse.json({ error: 'Только владелец может изменять настройки группы' }, { status: 403 })
    }

    const body = await request.json()
    const { title, avatarUrl } = body

    if (title !== undefined && (typeof title !== 'string' || title.trim().length < 1)) {
      return NextResponse.json({ error: 'Название группы не может быть пустым' }, { status: 400 })
    }

    const updated = await db.chat.update({
      where: { id: chatId },
      data: {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl ?? null } : {}),
      },
      select: { id: true, title: true, avatarUrl: true }
    })

    return NextResponse.json({ chat: updated })
  } catch (error) {
    console.error('Update group settings error:', error)
    return NextResponse.json({ error: 'Ошибка при обновлении настроек группы' }, { status: 500 })
  }
}
