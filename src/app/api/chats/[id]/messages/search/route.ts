import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decryptText } from '@/lib/serverCrypto'

const MAX_QUERY_LENGTH = 120
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const SEARCH_BATCH_SIZE = 200
const MAX_SCANNED_MESSAGES = 2000

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chatId } = await params
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }

    const session = await db.session.findUnique({ where: { token } })
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const membership = await db.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId: session.userId,
        },
      },
      select: { id: true },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Нет доступа к этому чату' }, { status: 403 })
    }

    const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? DEFAULT_LIMIT)
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitParam)))
      : DEFAULT_LIMIT

    if (query.length < 2) {
      return NextResponse.json({ error: 'Минимальная длина запроса — 2 символа' }, { status: 400 })
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: `Максимальная длина запроса — ${MAX_QUERY_LENGTH} символов` }, { status: 400 })
    }

    const q = query.toLocaleLowerCase('ru-RU')
    let scanned = 0
    let results: Array<{
      id: string
      chatId: string
      senderId: string
      senderUsername: string
      type: 'TEXT' | 'AUDIO' | 'IMAGE' | 'FILE' | 'VIDEO_NOTE'
      content: string
      audioUrl: string | null
      audioDuration: number | null
      fileUrl: string | null
      fileName: string | null
      fileSize: number | null
      videoNoteUrl: string | null
      videoNoteDuration: number | null
      replyToId: string | null
      isEdited: boolean
      isPinned: boolean
      pinnedAt: string | null
      isSavedByMe: boolean
      isForwarded: boolean
      forwardedFromUsername: string | null
      forwardedFromChatId: string | null
      createdAt: string
      reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>
    }> = []

    let cursorCreatedAt: Date | null = null
    let cursorId: string | null = null
    let reachedEnd = false

    while (results.length < limit && scanned < MAX_SCANNED_MESSAGES && !reachedEnd) {
      const batch = await db.message.findMany({
        where: {
          chatId,
          ...(cursorCreatedAt && cursorId
            ? {
                OR: [
                  { createdAt: { lt: cursorCreatedAt } },
                  { createdAt: cursorCreatedAt, id: { lt: cursorId } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SEARCH_BATCH_SIZE,
        include: {
          sender: { select: { username: true } },
          reactions: { select: { emoji: true, userId: true } },
          saves: { where: { userId: session.userId }, select: { id: true } },
        },
      })

      if (batch.length === 0) {
        reachedEnd = true
        break
      }

      scanned += batch.length
      const last = batch[batch.length - 1]
      cursorCreatedAt = last.createdAt
      cursorId = last.id

      for (const message of batch) {
        const content = decryptText(message.encryptedContent)
        if (!content.toLocaleLowerCase('ru-RU').includes(q)) continue

        results.push({
          id: message.id,
          chatId: message.chatId,
          senderId: message.senderId,
          senderUsername: message.sender.username,
          type: (message as any).type ?? 'TEXT',
          content,
          audioUrl: (message as any).audioUrl ?? null,
          audioDuration: (message as any).audioDuration ?? null,
          fileUrl: (message as any).fileUrl ?? null,
          fileName: (message as any).fileName ?? null,
          fileSize: (message as any).fileSize ?? null,
          videoNoteUrl: (message as any).videoNoteUrl ?? null,
          videoNoteDuration: (message as any).videoNoteDuration ?? null,
          replyToId: (message as any).replyToId ?? null,
          isEdited: (message as any).isEdited ?? false,
          isPinned: (message as any).isPinned ?? false,
          pinnedAt: (message as any).pinnedAt ? new Date((message as any).pinnedAt).toISOString() : null,
          isSavedByMe: !!(message as any).saves?.length,
          isForwarded: (message as any).isForwarded ?? false,
          forwardedFromUsername: (message as any).forwardedFromUsername ?? null,
          forwardedFromChatId: (message as any).forwardedFromChatId ?? null,
          createdAt: message.createdAt.toISOString(),
          reactions: Object.entries(
            ((message as any).reactions ?? []).reduce((acc: Record<string, string[]>, reaction: { emoji: string; userId: string }) => {
              if (!acc[reaction.emoji]) acc[reaction.emoji] = []
              acc[reaction.emoji].push(reaction.userId)
              return acc
            }, {})
          ).map(([emoji, userIds]) => ({
            emoji,
            count: userIds.length,
            reactedByMe: userIds.includes(session.userId),
          })),
        })

        if (results.length >= limit) break
      }
    }

    return NextResponse.json({
      messages: results.slice(0, limit),
      truncated: !reachedEnd && scanned >= MAX_SCANNED_MESSAGES,
      scanned,
    })
  } catch (error) {
    console.error('Search chat messages error:', error)
    return NextResponse.json({ error: 'Ошибка при поиске сообщений' }, { status: 500 })
  }
}
