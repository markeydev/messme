import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionByToken } from '@/lib/cache'
import { decryptText } from '@/lib/serverCrypto'

// PUT /api/chats/[id]/pinned-message
// Body: { messageId: string; pin: boolean }
//   pin: true  → add to pinned list
//   pin: false → remove from pinned list
// Requires: owner OR admin (group/channel), OR any member (1-on-1)
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

    // 1-on-1: any member can pin. Group/channel: only owner or admin.
    const canPin = !chat.isGroup || chat.ownerId === session.userId || membership.isAdmin
    if (!canPin) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })

    const body = await request.json() as { messageId: string; pin: boolean }
    const { messageId, pin } = body

    if (!messageId) return NextResponse.json({ error: 'messageId обязателен' }, { status: 400 })

    if (pin) {
      // Validate message belongs to this chat
      const message = await db.message.findUnique({
        where: { id: messageId },
        select: { id: true, chatId: true },
      })
      if (!message || message.chatId !== chatId) {
        return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
      }

      // Upsert — if already pinned, refresh pinnedAt
      await db.pinnedChatMessage.upsert({
        where: { chatId_messageId: { chatId, messageId } },
        update: { pinnedAt: new Date(), pinnedById: session.userId },
        create: { chatId, messageId, pinnedById: session.userId },
      })
    } else {
      await db.pinnedChatMessage.deleteMany({ where: { chatId, messageId } })
    }

    // Return full ordered list (newest first)
    const pins = await db.pinnedChatMessage.findMany({
      where: { chatId },
      orderBy: { pinnedAt: 'desc' },
      include: {
        message: {
          select: {
            id: true,
            encryptedContent: true,
            createdAt: true,
            sender: { select: { username: true } },
          },
        },
      },
    })

    const pinnedMessages = pins.map(pm => ({
      id: pm.message.id,
      content: decryptText(pm.message.encryptedContent),
      senderUsername: pm.message.sender?.username ?? null,
      createdAt: pm.message.createdAt,
      pinnedAt: pm.pinnedAt,
    }))

    return NextResponse.json({ pinnedMessages })
  } catch (error) {
    console.error('Pin message error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
