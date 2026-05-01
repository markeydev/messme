import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionByToken } from '@/lib/cache'
import { decryptText } from '@/lib/serverCrypto'

// PUT /api/chats/[id]/pinned-message
// Body: { messageId: string | null }
// Requires: owner OR isAdmin chat member
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chatId } = await params
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const session = await getSessionByToken(token)
    if (!session || new Date(session.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const chat = await db.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        ownerId: true,
        isGroup: true,
        members: { select: { userId: true, isAdmin: true } },
      },
    })
    if (!chat) return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })

    const membership = chat.members.find(m => m.userId === session.userId)
    if (!membership) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    // Only owner or admin members can pin/unpin
    const canPin = chat.ownerId === session.userId || membership.isAdmin
    if (!canPin) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })

    const body = await request.json() as { messageId: string | null }
    const messageId: string | null = body.messageId ?? null

    // If pinning, validate the message belongs to this chat
    if (messageId) {
      const message = await db.message.findUnique({
        where: { id: messageId },
        select: { id: true, chatId: true, encryptedContent: true, senderId: true, createdAt: true, sender: { select: { username: true } } },
      })
      if (!message || message.chatId !== chatId) {
        return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
      }

      await db.chat.update({ where: { id: chatId }, data: { pinnedMessageId: messageId } })

      return NextResponse.json({
        pinnedMessage: {
          id: message.id,
          content: decryptText(message.encryptedContent),
          senderUsername: message.sender?.username ?? null,
          createdAt: message.createdAt,
        },
      })
    }

    // Unpin
    await db.chat.update({ where: { id: chatId }, data: { pinnedMessageId: null } })
    return NextResponse.json({ pinnedMessage: null })
  } catch (error) {
    console.error('Pin message error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
