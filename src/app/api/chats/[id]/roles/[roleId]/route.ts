import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

export async function PATCH(
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
    const role = await db.gameRoomRole.findUnique({ where: { id: roleId } })
    if (!role || role.chatId !== chatId) return NextResponse.json({ error: 'Роль не найдена' }, { status: 404 })
    if (role.isDefault) return NextResponse.json({ error: 'Системную роль менять нельзя' }, { status: 400 })

    const updated = await db.gameRoomRole.update({
      where: { id: roleId },
      data: {
        ...(typeof body?.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
        ...(typeof body?.color === 'string' && body.color.trim() ? { color: body.color.trim() } : {}),
        ...(body?.permissions ? {
          canMoveMembers: !!body.permissions.canMoveMembers,
          canChangeAvatar: !!body.permissions.canChangeAvatar,
          canRenameChannels: !!body.permissions.canRenameChannels,
        } : {}),
      },
    })
    return NextResponse.json({ role: updated })
  } catch (error) {
    console.error('Update role error:', error)
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

    const role = await db.gameRoomRole.findUnique({ where: { id: roleId } })
    if (!role || role.chatId !== chatId) return NextResponse.json({ error: 'Роль не найдена' }, { status: 404 })
    if (role.isDefault) return NextResponse.json({ error: 'Системную роль удалить нельзя' }, { status: 400 })

    await db.gameRoomRole.delete({ where: { id: roleId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete role error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
