import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

// GET /api/chats/[id]/message-view-counts?ids=id1,id2,...
// Returns { counts: Record<messageId, number> }
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { id: chatId } = await params

    const chat = await db.chat.findUnique({
      where: { id: chatId },
      select: { isPersonalChannel: true },
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

    const url = new URL(request.url)
    const idsParam = url.searchParams.get('ids') ?? ''
    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200)

    if (ids.length === 0) return NextResponse.json({ counts: {} })

    const rows = await db.messageView.groupBy({
      by: ['messageId'],
      where: { messageId: { in: ids } },
      _count: { viewerId: true },
    })

    const counts: Record<string, number> = {}
    rows.forEach(row => { counts[row.messageId] = row._count.viewerId })

    return NextResponse.json({ counts })
  } catch (error) {
    console.error('Message view counts error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
