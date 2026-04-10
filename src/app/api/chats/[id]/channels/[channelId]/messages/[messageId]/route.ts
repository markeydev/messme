import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

// DELETE /api/chats/[id]/channels/[channelId]/messages/[messageId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; channelId: string; messageId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { id: chatId, messageId } = await params

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
    })
    if (!membership) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const msg = await db.channelMessage.findUnique({ where: { id: messageId } })
    if (!msg) return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
    if (msg.senderId !== session.userId) {
      return NextResponse.json({ error: 'Нельзя удалить чужое сообщение' }, { status: 403 })
    }

    await db.channelMessage.delete({ where: { id: messageId } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete channel message error:', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

// PATCH /api/chats/[id]/channels/[channelId]/messages/[messageId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; channelId: string; messageId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { id: chatId, messageId } = await params

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
    })
    if (!membership) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const msg = await db.channelMessage.findUnique({ where: { id: messageId } })
    if (!msg) return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
    if (msg.senderId !== session.userId) {
      return NextResponse.json({ error: 'Нельзя редактировать чужое сообщение' }, { status: 403 })
    }

    const body = await request.json()
    const { content } = body
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Необходимо содержимое' }, { status: 400 })
    }

    const updated = await db.channelMessage.update({
      where: { id: messageId },
      data: { content: content.trim() },
    })
    return NextResponse.json({ message: updated })
  } catch (err) {
    console.error('Edit channel message error:', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
