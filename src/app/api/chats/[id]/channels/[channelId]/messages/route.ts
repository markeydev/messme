import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'

async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

// GET /api/chats/[id]/channels/[channelId]/messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; channelId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { id: chatId, channelId } = await params

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
    })
    if (!membership) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const url = new URL(request.url)
    const beforeId = url.searchParams.get('before')
    const LIMIT = 50

    const messages = await db.channelMessage.findMany({
      where: {
        channelId,
        ...(beforeId ? { id: { lt: beforeId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: LIMIT + 1,
    })

    const hasMore = messages.length > LIMIT
    const result = messages.slice(0, LIMIT).reverse()

    return NextResponse.json({ messages: result, hasMore })
  } catch (err) {
    console.error('Get channel messages error:', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

// POST /api/chats/[id]/channels/[channelId]/messages
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; channelId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { id: chatId, channelId } = await params

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
    })
    if (!membership) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { username: true },
    })

    const body = await request.json()
    const { content } = body
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Необходимо содержимое' }, { status: 400 })
    }

    const message = await db.channelMessage.create({
      data: {
        id: randomUUID(),
        channelId,
        senderId: session.userId,
        senderUsername: user?.username ?? 'Unknown',
        content: content.trim(),
      },
    })

    return NextResponse.json({ message })
  } catch (err) {
    console.error('Send channel message error:', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
