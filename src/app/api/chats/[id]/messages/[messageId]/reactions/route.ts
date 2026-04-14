import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ALLOWED_EMOJIS = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥'])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { id: chatId, messageId } = await params
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const session = await db.session.findUnique({ where: { token } })
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
      select: { id: true },
    })
    if (!membership) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const message = await db.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true },
    })
    if (!message || message.chatId !== chatId) {
      return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
    }

    const body = await request.json()
    const emoji = typeof body?.emoji === 'string' ? body.emoji.trim() : ''
    if (!ALLOWED_EMOJIS.has(emoji)) {
      return NextResponse.json({ error: 'Недопустимая реакция' }, { status: 400 })
    }

    const existing = await db.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId: session.userId, emoji } },
      select: { id: true },
    })

    if (existing) {
      await db.messageReaction.delete({ where: { messageId_userId_emoji: { messageId, userId: session.userId, emoji } } })
    } else {
      await db.messageReaction.create({ data: { messageId, userId: session.userId, emoji } })
    }

    const reactions = await db.messageReaction.findMany({
      where: { messageId },
      select: { emoji: true, userId: true },
    })

    const aggregated = Object.entries(
      reactions.reduce((acc: Record<string, string[]>, reaction) => {
        if (!acc[reaction.emoji]) acc[reaction.emoji] = []
        acc[reaction.emoji].push(reaction.userId)
        return acc
      }, {})
    ).map(([emojiValue, userIds]) => ({
      emoji: emojiValue,
      count: userIds.length,
      reactedByMe: userIds.includes(session.userId),
    }))

    return NextResponse.json({ reactions: aggregated })
  } catch (error) {
    console.error('Toggle reaction error:', error)
    return NextResponse.json({ error: 'Ошибка реакции' }, { status: 500 })
  }
}
