import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionByToken } from '@/lib/cache'

// GET /api/chats/[id]/messages/[messageId]/comments?cursor=...
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { id: chatId, messageId } = await params
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const session = await getSessionByToken(token)
    if (!session || new Date(session.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
    })
    if (!membership) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const message = await db.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true },
    })
    if (!message || message.chatId !== chatId) {
      return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
    }

    const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined
    const take = 50

    const comments = await db.messageComment.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, isBadgeVerified: true } },
      },
    })

    const hasMore = comments.length > take
    const items = hasMore ? comments.slice(0, take) : comments

    return NextResponse.json({
      comments: items.map(c => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        user: c.user,
      })),
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    })
  } catch (err) {
    console.error('Message comments GET error:', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

// POST /api/chats/[id]/messages/[messageId]/comments
// Body: { content: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { id: chatId, messageId } = await params
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const session = await getSessionByToken(token)
    if (!session || new Date(session.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
    })
    if (!membership) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    // Only allow comments in personal channels (posts feed)
    const chat = await db.chat.findUnique({
      where: { id: chatId },
      select: { isPersonalChannel: true },
    })
    if (!chat?.isPersonalChannel) {
      return NextResponse.json({ error: 'Комментарии доступны только в личных каналах' }, { status: 400 })
    }

    const message = await db.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true },
    })
    if (!message || message.chatId !== chatId) {
      return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
    }

    const body = await request.json() as { content?: string }
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return NextResponse.json({ error: 'Комментарий не может быть пустым' }, { status: 400 })
    if (content.length > 2000) return NextResponse.json({ error: 'Комментарий слишком длинный' }, { status: 400 })

    const comment = await db.messageComment.create({
      data: { messageId, userId: session.userId, content },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, isBadgeVerified: true } },
      },
    })

    const commentsCount = await db.messageComment.count({ where: { messageId } })

    return NextResponse.json({
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        user: comment.user,
      },
      commentsCount,
    })
  } catch (err) {
    console.error('Message comments POST error:', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
