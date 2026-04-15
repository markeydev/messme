import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chatId } = await params
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const session = await db.session.findUnique({ where: { token } })
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const chat = await db.chat.findUnique({ where: { id: chatId } })
    if (!chat) return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })

    if (!chat.isPersonalChannel) {
      return NextResponse.json({ error: 'Только для личных каналов' }, { status: 400 })
    }

    if (chat.ownerId !== session.userId) {
      return NextResponse.json({ error: 'Только владелец канала может назначать администраторов' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, isAdmin } = body

    if (typeof userId !== 'string' || typeof isAdmin !== 'boolean') {
      return NextResponse.json({ error: 'Некорректные параметры' }, { status: 400 })
    }

    if (userId === session.userId) {
      return NextResponse.json({ error: 'Нельзя изменить роль создателя канала' }, { status: 400 })
    }

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Пользователь не является участником канала' }, { status: 404 })
    }

    const updated = await db.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { isAdmin },
    })

    return NextResponse.json({ success: true, isAdmin: updated.isAdmin })
  } catch (error) {
    console.error('Set channel admin error:', error)
    return NextResponse.json({ error: 'Ошибка при назначении администратора' }, { status: 500 })
  }
}
