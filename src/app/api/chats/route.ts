import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decryptText } from '@/lib/serverCrypto'
import { getSessionByToken, getChatListCache, setChatListCache } from '@/lib/cache'

// Get all chats for authenticated user
export async function GET(request: NextRequest) {
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
    const session = await getSessionByToken(token)

    if (!session || new Date(session.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'Сессия истекла' },
        { status: 401 }
      )
    }

    const devId = request.headers.get('X-Device-Id') ?? ''
    void devId // no longer used

    // Return cached chat list if available
    const cached = await getChatListCache(session.userId)
    if (cached) return NextResponse.json({ chats: cached })

    // Get all chats where user is a member
    const chatMembers = await db.chatMember.findMany({
      where: { userId: session.userId },
      include: {
        chat: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatarUrl: true,
                    isBadgeVerified: true,
                  }
                }
              }
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                type: true,
                encryptedContent: true,
                fileName: true,
                createdAt: true,
                senderId: true,
              }
            }
          }
        }
      },
      orderBy: {
        chat: {
          updatedAt: 'desc'
        }
      }
    })

    const chats = chatMembers.map(cm => {
      const chat = cm.chat
      const otherMembers = chat.members.filter(m => m.userId !== session.userId)

      // For 1-on-1 chats, use the other user's name as title
      const title = chat.isGroup
        ? chat.title
        : otherMembers[0]?.user.username || 'Неизвестный'

      const avatarUrl = chat.isGroup
        ? (chat as any).avatarUrl ?? null
        : otherMembers[0]?.user.avatarUrl ?? null

      return {
        id: chat.id,
        title,
        isGroup: chat.isGroup,
        isPersonalChannel: (chat as any).isPersonalChannel ?? false,
        gameMode: (chat as any).gameMode ?? false,
        avatarUrl,
        ownerId: (chat as any).ownerId ?? null,
        members: chat.members.map(m => ({
          id: m.user.id,
          username: m.user.username,
          avatarUrl: m.user.avatarUrl ?? null,
          isBadgeVerified: m.user.isBadgeVerified,
        })),
        lastMessage: chat.messages[0]
          ? {
              id: chat.messages[0].id,
              type: (chat.messages[0] as any).type ?? 'TEXT',
              content: decryptText(chat.messages[0].encryptedContent),
              fileName: (chat.messages[0] as any).fileName ?? null,
              createdAt: chat.messages[0].createdAt,
              senderId: chat.messages[0].senderId,
            }
          : null,
        updatedAt: chat.updatedAt
      }
    })

    setChatListCache(session.userId, chats)

    return NextResponse.json({ chats })
  } catch (error) {
    console.error('Get chats error:', error)
    return NextResponse.json(
      { error: 'Ошибка при получении чатов' },
      { status: 500 }
    )
  }
}
