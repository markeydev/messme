import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { ensureDefaultGameRoomRole } from '@/lib/game-room-permissions'

async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const { id: chatId } = await params

    const member = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
    })
    if (!member) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const chat = await db.chat.findUnique({ where: { id: chatId }, select: { gameMode: true } })
    if (!chat?.gameMode) return NextResponse.json({ error: 'Не game room' }, { status: 400 })

    await ensureDefaultGameRoomRole(chatId)
    const roles = await db.gameRoomRole.findMany({
      where: { chatId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, avatarUrl: true } },
          },
        },
      },
    })

    return NextResponse.json({
      roles: roles.map(r => ({
        id: r.id,
        chatId: r.chatId,
        name: r.name,
        color: r.color,
        position: r.position,
        isDefault: r.isDefault,
        permissions: {
          canMoveMembers: r.canMoveMembers,
          canChangeAvatar: r.canChangeAvatar,
          canRenameChannels: r.canRenameChannels,
        },
        members: r.members.map(m => m.user),
      })),
    })
  } catch (error) {
    console.error('Get game roles error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const { id: chatId } = await params
    const chat = await db.chat.findUnique({ where: { id: chatId }, select: { ownerId: true, gameMode: true } })
    if (!chat || !chat.gameMode) return NextResponse.json({ error: 'Не game room' }, { status: 400 })
    if (chat.ownerId !== session.userId) return NextResponse.json({ error: 'Только владелец может создавать роли' }, { status: 403 })

    const body = await request.json()
    const name = String(body?.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Название роли обязательно' }, { status: 400 })
    const color = typeof body?.color === 'string' && body.color.trim() ? body.color.trim() : '#8b97ff'

    const last = await db.gameRoomRole.findFirst({
      where: { chatId },
      orderBy: { position: 'desc' },
      select: { position: true },
    })

    const role = await db.gameRoomRole.create({
      data: {
        id: randomUUID(),
        chatId,
        name,
        color,
        position: (last?.position ?? 0) + 1,
        isDefault: false,
        canMoveMembers: !!body?.permissions?.canMoveMembers,
        canChangeAvatar: !!body?.permissions?.canChangeAvatar,
        canRenameChannels: !!body?.permissions?.canRenameChannels,
      },
    })
    return NextResponse.json({ role })
  } catch (error) {
    console.error('Create role error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
