import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decryptText } from '@/lib/serverCrypto'

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
      },
      select: {
        id: true,
        isPinned: true,
        pinnedAt: true,
        isArchived: true,
        archivedAt: true,
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'Нет доступа к этому чату' },
        { status: 403 }
      )
    }

    // Optional cursor: load messages before this messageId (for pagination)
    const beforeId = request.nextUrl.searchParams.get('before')
    let cursorCreatedAt: Date | undefined
    if (beforeId) {
      const cursorMsg = await db.message.findUnique({ where: { id: beforeId }, select: { createdAt: true } })
      if (cursorMsg) cursorCreatedAt = cursorMsg.createdAt
    }

    // Get chat with messages
    const chat = await db.chat.findUnique({
      where: { id: chatId },
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
          take: 100,
          ...(cursorCreatedAt ? { where: { createdAt: { lt: cursorCreatedAt } } } : {}),
          include: {
            sender: { select: { username: true } },
            reactions: { select: { emoji: true, userId: true } },
            saves: { where: { userId: session.userId }, select: { id: true } },
            replyTo: {
              select: {
                id: true,
                senderId: true,
                encryptedContent: true,
                sender: { select: { username: true } },
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

    // For 1-on-1 chat, set title to other user's name
    const title = chat.isGroup
      ? chat.title
      : chat.members.find(m => m.userId !== session.userId)?.user.username || 'Чат'

    const mappedMessages = [...chat.messages].reverse().map(msg => ({
          id: msg.id,
          chatId: chatId,
          type: (msg as any).type ?? 'TEXT',
          content: decryptText(msg.encryptedContent),
          audioUrl: (msg as any).audioUrl ?? null,
          audioDuration: (msg as any).audioDuration ?? null,
          fileUrl: (msg as any).fileUrl ?? null,
          fileName: (msg as any).fileName ?? null,
          fileSize: (msg as any).fileSize ?? null,
          videoNoteUrl: (msg as any).videoNoteUrl ?? null,
          videoNoteDuration: (msg as any).videoNoteDuration ?? null,
          senderId: msg.senderId,
          senderUsername: (msg as any).sender?.username,
          isEdited: (msg as any).isEdited ?? false,
          isPinned: (msg as any).isPinned ?? false,
          pinnedAt: (msg as any).pinnedAt ?? null,
          isSavedByMe: !!(msg as any).saves?.length,
          isForwarded: (msg as any).isForwarded ?? false,
          forwardedFromUsername: (msg as any).forwardedFromUsername ?? null,
          forwardedFromChatId: (msg as any).forwardedFromChatId ?? null,
          replyToId: (msg as any).replyToId ?? null,
          replyTo: (msg as any).replyTo ? {
            id: (msg as any).replyTo.id,
            senderId: (msg as any).replyTo.senderId,
            senderUsername: (msg as any).replyTo.sender?.username,
            content: decryptText((msg as any).replyTo.encryptedContent),
          } : null,
          reactions: Object.entries(
            ((msg as any).reactions ?? []).reduce((acc: Record<string, string[]>, reaction: { emoji: string; userId: string }) => {
              if (!acc[reaction.emoji]) acc[reaction.emoji] = []
              acc[reaction.emoji].push(reaction.userId)
              return acc
            }, {})
          ).map(([emoji, userIds]) => ({
            emoji,
            count: userIds.length,
            reactedByMe: userIds.includes(session.userId),
          })),
          createdAt: msg.createdAt
        }))

    // For pagination requests (?before=...) — return only the messages batch
    if (beforeId) {
      return NextResponse.json({
        messages: mappedMessages,
        hasMore: chat.messages.length === 100,
      })
    }

    return NextResponse.json({
      chat: {
        id: chat.id,
        title,
        isGroup: chat.isGroup,
        isPersonalChannel: (chat as any).isPersonalChannel ?? false,
        isVerified: (chat as any).isVerified ?? false,
        gameMode: (chat as any).gameMode ?? false,
        avatarUrl: (chat as any).avatarUrl ?? null,
        ownerId: (chat as any).ownerId ?? null,
        isPinned: membership.isPinned ?? false,
        pinnedAt: membership.pinnedAt ?? null,
        isArchived: membership.isArchived ?? false,
        archivedAt: membership.archivedAt ?? null,
        members: chat.members.map(m => ({
          id: m.user.id,
          username: m.user.username,
          avatarUrl: (m.user as any).avatarUrl ?? null,
          isBadgeVerified: (m.user as any).isBadgeVerified ?? false,
          isAdmin: (m as any).isAdmin ?? false,
        })),
        messages: mappedMessages,
        hasMore: chat.messages.length === 100,
      }
    })
  } catch (error) {
    console.error('Get chat error:', error)
    return NextResponse.json(
      { error: 'Ошибка при получении чата' },
      { status: 500 }
    )
  }
}
