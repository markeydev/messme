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

// GET /api/chats/[id]/channels — list channels of a game-mode chat
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { id: chatId } = await params

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
    })
    if (!membership) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const channels = await db.channel.findMany({
      where: { chatId },
      orderBy: [{ type: 'asc' }, { position: 'asc' }],
    })

    return NextResponse.json({ channels })
  } catch (err) {
    console.error('Get channels error:', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

// POST /api/chats/[id]/channels — create a channel
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { id: chatId } = await params

    const chat = await db.chat.findUnique({
      where: { id: chatId },
      include: { members: true },
    })
    if (!chat) return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })

    const isMember = chat.members.some(m => m.userId === session.userId)
    if (!isMember) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    if (!chat.gameMode) return NextResponse.json({ error: 'Не game-mode чат' }, { status: 400 })

    const body = await request.json()
    const { name, type = 'TEXT' } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Необходимо указать название' }, { status: 400 })
    }
    if (!['TEXT', 'VOICE'].includes(type)) {
      return NextResponse.json({ error: 'Неверный тип канала' }, { status: 400 })
    }

    const lastChannel = await db.channel.findFirst({
      where: { chatId, type },
      orderBy: { position: 'desc' },
    })

    const channel = await db.channel.create({
      data: {
        id: randomUUID(),
        chatId,
        name: name.trim(),
        type,
        position: (lastChannel?.position ?? -1) + 1,
      },
    })

    return NextResponse.json({ channel })
  } catch (err) {
    console.error('Create channel error:', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

// DELETE /api/chats/[id]/channels?channelId=... — delete a channel
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { id: chatId } = await params
    const channelId = new URL(request.url).searchParams.get('channelId')
    if (!channelId) return NextResponse.json({ error: 'channelId обязателен' }, { status: 400 })

    const chat = await db.chat.findUnique({ where: { id: chatId } })
    if (!chat || chat.ownerId !== session.userId) {
      return NextResponse.json({ error: 'Нет прав' }, { status: 403 })
    }

    await db.channel.delete({ where: { id: channelId } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete channel error:', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
