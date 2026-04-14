import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { assignDefaultRole } from '@/lib/game-room-permissions'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chatId } = await params
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      )
    }

    // Find session
    const session = await db.session.findUnique({
      where: { token }
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Сессия истекла' },
        { status: 401 }
      )
    }

    // Check if user is member of this chat
    const membership = await db.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId: session.userId
        }
      }
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'Нет доступа к этому чату' },
        { status: 403 }
      )
    }

    // Check if chat is a group
    const chat = await db.chat.findUnique({
      where: { id: chatId }
    })

    if (!chat || !chat.isGroup) {
      return NextResponse.json(
        { error: 'Можно добавлять участников только в группы' },
        { status: 400 }
      )
    }

    if ((chat as any).isPersonalChannel && chat.ownerId !== session.userId) {
      return NextResponse.json(
        { error: 'Только владелец канала может добавлять участников' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { userIds } = body

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'Необходимо указать пользователей' },
        { status: 400 }
      )
    }

    // Add new members
    const newMembers = []
    for (const userId of userIds) {
      // Check if already a member
      const existing = await db.chatMember.findUnique({
        where: {
          chatId_userId: {
            chatId,
            userId
          }
        }
      })

      if (!existing) {
        const member = await db.chatMember.create({
          data: {
            id: randomUUID(),
            chatId,
            userId
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                isBadgeVerified: true,
              }
            }
          }
        })
        newMembers.push({
          id: member.user.id,
          username: member.user.username,
          isBadgeVerified: (member.user as any).isBadgeVerified ?? false,
        })
        if (chat.gameMode) {
          await assignDefaultRole(chatId, userId)
        }
      }
    }

    return NextResponse.json({
      success: true,
      newMembers,
      memberIds: userIds
    })
  } catch (error) {
    console.error('Add members error:', error)
    return NextResponse.json(
      { error: 'Ошибка при добавлении участников' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chatId } = await params
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json(
        { error: 'Не авторизован' },
        { status: 401 }
      )
    }

    const session = await db.session.findUnique({
      where: { token }
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Сессия истекла' },
        { status: 401 }
      )
    }

    const chat = await db.chat.findUnique({
      where: { id: chatId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                publicKey: true,
                isBadgeVerified: true,
              }
            }
          }
        }
      }
    })

    if (!chat) {
      return NextResponse.json(
        { error: 'Чат не найден' },
        { status: 404 }
      )
    }

    const membership = await db.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId: session.userId
        }
      }
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'Нет доступа к этому чату' },
        { status: 403 }
      )
    }

    // In personal channels, non-owners can only see aggregate subscriber count, not member identities.
    if ((chat as any).isPersonalChannel && chat.ownerId !== session.userId) {
      return NextResponse.json({
        members: [],
        subscribersCount: chat.members.length
      })
    }

    return NextResponse.json({
      members: chat.members.map(m => ({
        id: m.user.id,
        username: m.user.username,
        publicKey: m.user.publicKey,
        isBadgeVerified: (m.user as any).isBadgeVerified ?? false,
      }))
    })
  } catch (error) {
    console.error('Get members error:', error)
    return NextResponse.json(
      { error: 'Ошибка при получении участников' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chatId } = await params
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }

    const session = await db.session.findUnique({ where: { token } })
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const chat = await db.chat.findUnique({ where: { id: chatId } })
    if (!chat) {
      return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
    }

    // Optional: kick another member (only group owner can do this)
    const targetUserId = request.nextUrl.searchParams.get('targetUserId')
    if (targetUserId) {
      if (!chat.isGroup) {
        return NextResponse.json({ error: 'Кикать можно только из групп' }, { status: 400 })
      }
      if (chat.ownerId !== session.userId) {
        return NextResponse.json({ error: 'Только создатель может исключать участников' }, { status: 403 })
      }
      if (targetUserId === session.userId) {
        return NextResponse.json({ error: 'Нельзя исключить самого себя' }, { status: 400 })
      }
      await db.chatMember.deleteMany({ where: { chatId, userId: targetUserId } })
      return NextResponse.json({ success: true })
    }

    // Self-leave / delete conversation
    await db.chatMember.deleteMany({ where: { chatId, userId: session.userId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Leave/kick error:', error)
    return NextResponse.json({ error: 'Ошибка при выходе из чата' }, { status: 500 })
  }
}
