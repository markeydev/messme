import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { assignDefaultRole } from '@/lib/game-room-permissions'

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json()
    const { title, memberIds, isGroup, gameMode } = body

    // Validation
    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json(
        { error: 'Необходимо выбрать хотя бы одного участника' },
        { status: 400 }
      )
    }

    // Include the creator in members
    const allMemberIds = [...new Set([session.userId, ...memberIds])]

    // For 1-on-1 chat, check if chat already exists
    if (!isGroup && allMemberIds.length === 2) {
      const existingChats = await db.chat.findMany({
        where: {
          isGroup: false,
          members: {
            some: {
              userId: session.userId
            }
          }
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                }
              }
            }
          }
        }
      })

      // Find chat with exactly these two members
      const existingChat = existingChats.find(chat => {
        const chatMemberIds = chat.members.map(m => m.userId).sort()
        const targetMemberIds = allMemberIds.sort()
        return chatMemberIds.length === 2 &&
          chatMemberIds[0] === targetMemberIds[0] &&
          chatMemberIds[1] === targetMemberIds[1]
      })

      if (existingChat) {
        return NextResponse.json({
          chat: {
            id: existingChat.id,
            title: existingChat.members.find(m => m.userId !== session.userId)?.user.username || 'Чат',
            isGroup: false,
            members: existingChat.members.map(m => ({
              id: m.user.id,
              username: m.user.username,
            })),
            memberIds: existingChat.members.map(m => m.userId)
          },
          isNew: false
        })
      }
    }

    // Create chat
    const chatId = randomUUID()
    const chat = await db.chat.create({
      data: {
        id: chatId,
        title: isGroup ? title : null,
        isGroup: isGroup || false,
        gameMode: !!(isGroup && gameMode),
        ownerId: session.userId,
        members: {
          create: allMemberIds.map(userId => ({
            id: randomUUID(),
            userId
          }))
        },
        ...(isGroup && gameMode ? {
          channels: {
            create: [
              { id: randomUUID(), name: 'general', type: 'TEXT', position: 0 },
              { id: randomUUID(), name: 'announcements', type: 'TEXT', position: 1 },
              { id: randomUUID(), name: 'General', type: 'VOICE', position: 0 },
            ]
          }
        } : {})
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              }
            }
          }
        }
      }
    })

    if (chat.gameMode) {
      await Promise.all(allMemberIds.map(userId => assignDefaultRole(chat.id, userId)))
      await db.gameRoomRole.create({
        data: {
          id: randomUUID(),
          chatId: chat.id,
          name: 'Модератор',
          color: '#22c55e',
          position: 1,
          isDefault: false,
          canMoveMembers: true,
          canChangeAvatar: true,
          canRenameChannels: true,
          members: {
            create: {
              id: randomUUID(),
              userId: session.userId,
            },
          },
        },
      }).catch(() => {})
    }

    // For 1-on-1 chat, set title to other user's name
    const chatTitle = chat.isGroup
      ? chat.title
      : chat.members.find(m => m.userId !== session.userId)?.user.username || 'Чат'

    return NextResponse.json({
      chat: {
        id: chat.id,
        title: chatTitle,
        isGroup: chat.isGroup,
        gameMode: chat.gameMode,
        members: chat.members.map(m => ({
          id: m.user.id,
          username: m.user.username,
        })),
        memberIds: chat.members.map(m => m.userId)
      },
      isNew: true
    })
  } catch (error) {
    console.error('Create chat error:', error)
    return NextResponse.json(
      { error: 'Ошибка при создании чата' },
      { status: 500 }
    )
  }
}
