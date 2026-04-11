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

async function assertOwner(chatId: string, userId: string) {
  const chat = await db.chat.findUnique({ where: { id: chatId }, select: { ownerId: true, gameMode: true } })
  if (!chat || !chat.gameMode) return { ok: false, code: 400 as const, error: 'Не game room' }
  if (chat.ownerId !== userId) return { ok: false, code: 403 as const, error: 'Только владелец' }
  return { ok: true }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const { id: chatId, roleId } = await params
    const owner = await assertOwner(chatId, session.userId)
    if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.code })

    const body = await request.json()
    const userId = String(body?.userId ?? '')
    if (!userId) return NextResponse.json({ error: 'userId обязателен' }, { status: 400 })

    const role = await db.gameRoomRole.findUnique({ where: { id: roleId } })
    if (!role || role.chatId !== chatId) return NextResponse.json({ error: 'Роль не найдена' }, { status: 404 })

    const member = await db.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } })
    if (!member) return NextResponse.json({ error: 'Пользователь не состоит в комнате' }, { status: 400 })

    const created = await db.gameRoomRoleMember.upsert({
      where: { roleId_userId: { roleId, userId } },
      update: {},
      create: { id: randomUUID(), roleId, userId },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    })
    return NextResponse.json({ member: created.user })
  } catch (error) {
    console.error('Assign role member error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const { id: chatId, roleId } = await params
    const owner = await assertOwner(chatId, session.userId)
    if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.code })

    const userId = request.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId обязателен' }, { status: 400 })
    await db.gameRoomRoleMember.deleteMany({ where: { roleId, userId, role: { chatId } } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Remove role member error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
