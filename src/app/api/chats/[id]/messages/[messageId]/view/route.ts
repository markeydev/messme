import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

// POST /api/chats/[id]/messages/[messageId]/view — register a message view
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { id: chatId, messageId } = await params

    const chat = await db.chat.findUnique({
      where: { id: chatId },
      select: { isPersonalChannel: true, ownerId: true },
    })
    if (!chat?.isPersonalChannel) {
      return NextResponse.json({ error: 'Не личный канал' }, { status: 400 })
    }

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    // Owner's own view is not counted
    if (chat.ownerId !== session.userId) {
      const message = await db.message.findUnique({
        where: { id: messageId },
        select: { id: true, chatId: true },
      })
      if (!message || message.chatId !== chatId) {
        return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
      }

      await db.messageView.upsert({
        where: { messageId_viewerId: { messageId, viewerId: session.userId } },
        update: {},
        create: { messageId, viewerId: session.userId },
      })
    }

    const viewsCount = await db.messageView.count({ where: { messageId } })
    return NextResponse.json({ viewsCount })
  } catch (error) {
    console.error('Message view error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
