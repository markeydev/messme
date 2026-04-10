import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

// PATCH /api/chats/[id]/channels/[channelId] — rename channel
export async function PATCH(
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

    const body = await request.json()
    const { name } = body
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Необходимо название' }, { status: 400 })
    }

    const channel = await db.channel.update({
      where: { id: channelId },
      data: { name: name.trim() },
    })
    return NextResponse.json({ channel })
  } catch (err) {
    console.error('Rename channel error:', err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
