import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionByToken } from '@/lib/cache'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chatId } = await params
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const session = await getSessionByToken(token)
    if (!session || new Date(session.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } },
    })
    if (!membership) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const tab = request.nextUrl.searchParams.get('tab') ?? 'images' // images | files | videos
    const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined
    const take = 40

    let cursorCreatedAt: Date | undefined
    if (cursor) {
      const cursorMsg = await db.message.findUnique({ where: { id: cursor }, select: { createdAt: true } })
      if (cursorMsg) cursorCreatedAt = cursorMsg.createdAt
    }

    const typeFilter =
      tab === 'images' ? { in: ['IMAGE'] as const } :
      tab === 'files'  ? { in: ['FILE'] as const } :
      /* videos */       { in: ['VIDEO_NOTE'] as const }

    const messages = await db.message.findMany({
      where: {
        chatId,
        type: typeFilter,
        fileUrl: { not: null },
        ...(cursorCreatedAt ? { createdAt: { lt: cursorCreatedAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      select: {
        id: true,
        type: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        videoNoteUrl: true,
        createdAt: true,
        sender: { select: { id: true, username: true } },
      },
    })

    // For VIDEO_NOTE type the URL is in videoNoteUrl, not fileUrl
    // Also include VIDEO_NOTE messages that use videoNoteUrl
    let allMessages = messages
    if (tab === 'videos') {
      const videoNotes = await db.message.findMany({
        where: {
          chatId,
          type: 'VIDEO_NOTE',
          videoNoteUrl: { not: null },
          ...(cursorCreatedAt ? { createdAt: { lt: cursorCreatedAt } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        select: {
          id: true,
          type: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          videoNoteUrl: true,
          createdAt: true,
          sender: { select: { id: true, username: true } },
        },
      })
      // Merge and re-sort
      const merged = [...messages, ...videoNotes]
      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      // Deduplicate
      const seen = new Set<string>()
      allMessages = merged.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
    }

    const hasMore = allMessages.length > take
    const items = allMessages.slice(0, take)

    return NextResponse.json({
      items: items.map(m => ({
        id: m.id,
        type: m.type,
        url: m.type === 'VIDEO_NOTE' ? (m.videoNoteUrl ?? m.fileUrl) : m.fileUrl,
        fileName: m.fileName,
        fileSize: m.fileSize,
        createdAt: m.createdAt,
        senderUsername: m.sender.username,
      })),
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    })
  } catch (error) {
    console.error('Chat media error:', error)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
