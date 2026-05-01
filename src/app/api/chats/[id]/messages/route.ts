import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { encryptText, decryptText } from '@/lib/serverCrypto'
import webpush from 'web-push'
import { getSessionByToken, invalidateChatListCache } from '@/lib/cache'

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@messme.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export async function POST(
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

    const session = await getSessionByToken(token)
    if (!session || new Date(session.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    // Verify membership
    const membership = await db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: session.userId } }
    })
    if (!membership) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    const chat = await db.chat.findUnique({
      where: { id: chatId },
      select: { ownerId: true, isPersonalChannel: true },
    })
    if (!chat) {
      return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
    }
    if (chat.isPersonalChannel && chat.ownerId !== session.userId && !membership.isAdmin) {
      return NextResponse.json({ error: 'В личном канале может публиковать только создатель' }, { status: 403 })
    }

    const body = await request.json()
    const { content, replyToId, isForwarded, forwardedFromUsername, forwardedFromChatId, type, audioUrl, audioDuration, fileUrl, fileName, fileSize, videoNoteUrl, videoNoteDuration, linkPreview } = body
    if (content === undefined || content === null || typeof content !== 'string') {
      return NextResponse.json({ error: 'Нет содержимого' }, { status: 400 })
    }

    const msgType = type === 'AUDIO' ? 'AUDIO' : type === 'IMAGE' ? 'IMAGE' : type === 'FILE' ? 'FILE' : type === 'VIDEO_NOTE' ? 'VIDEO_NOTE' : 'TEXT'

    // Encrypt content server-side before storing
    const encryptedContent = encryptText(content)

    const message = await db.message.create({
      data: {
        id: randomUUID(),
        chatId,
        senderId: session.userId,
        type: msgType,
        encryptedContent,
        ...(audioUrl ? { audioUrl } : {}),
        ...(audioDuration != null ? { audioDuration: Math.round(audioDuration) } : {}),
        ...(fileUrl ? { fileUrl } : {}),
        ...(fileName ? { fileName } : {}),
        ...(fileSize != null ? { fileSize: Math.round(fileSize) } : {}),
        ...(videoNoteUrl ? { videoNoteUrl } : {}),
        ...(videoNoteDuration != null ? { videoNoteDuration: Math.round(videoNoteDuration) } : {}),
        ...(linkPreview && typeof linkPreview === 'object' ? { linkPreviewJson: JSON.stringify(linkPreview) } : {}),
        ...(replyToId ? { replyToId } : {}),
        ...(isForwarded
          ? {
              isForwarded: true,
              forwardedFromUsername: forwardedFromUsername ?? null,
              forwardedFromChatId: typeof forwardedFromChatId === 'string' ? forwardedFromChatId : null,
            }
          : {}),
      },
      include: {
        sender: { select: { id: true, username: true } },
        replyTo: {
          select: {
            id: true,
            senderId: true,
            encryptedContent: true,
            sender: { select: { username: true } }
          }
        }
      }
    })

    // Update chat's updatedAt so it bubbles to the top of the list
    await db.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() }
    })

    // Invalidate the chat list cache for all members so they see the latest message
    db.chatMember.findMany({ where: { chatId }, select: { userId: true } })
      .then(members => members.forEach(m => invalidateChatListCache(m.userId)))
      .catch(() => {})

    // Send push notifications to other members
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      const senderUsername = message.sender.username

      let notifBody: string
      if (msgType === 'TEXT') {
        notifBody = content.length > 100 ? content.slice(0, 100) + '…' : content
      } else if (msgType === 'AUDIO') {
        notifBody = '🎤 Голосовое сообщение'
      } else if (msgType === 'IMAGE') {
        notifBody = '🖼 Фото'
      } else if (msgType === 'FILE') {
        notifBody = `📎 ${fileName ?? 'Файл'}`
      } else if (msgType === 'VIDEO_NOTE') {
        notifBody = '🎥 Видеосообщение'
      } else {
        notifBody = 'Новое сообщение'
      }

      let activeUserIds: string[] = []
      try {
        const wsUrl = process.env.WS_INTERNAL_URL ?? 'http://localhost:3003'
        const resp = await fetch(`${wsUrl}/active-in-chat/${chatId}`, { signal: AbortSignal.timeout(500) })
        if (resp.ok) {
          const data = await resp.json() as { activeUserIds: string[] }
          activeUserIds = data.activeUserIds
        }
      } catch { /* WS server unreachable — send to everyone */ }

      const payload = JSON.stringify({ title: senderUsername, body: notifBody, chatId, url: '/' })
      const otherMembers = await db.chatMember.findMany({
        where: { chatId, userId: { not: session.userId } },
        select: { userId: true },
      })
      const memberIds = otherMembers.map(m => m.userId).filter(id => !activeUserIds.includes(id))
      if (memberIds.length > 0) {
        const subscriptions = await db.pushSubscription.findMany({
          where: { userId: { in: memberIds } },
        })
        await Promise.allSettled(
          subscriptions.map(sub =>
            webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            ).catch(async (err) => {
              if (err?.statusCode === 410) {
                await db.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {})
              }
            })
          )
        )
      }
    }

    return NextResponse.json({
      message: {
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        senderUsername: message.sender.username,
        type: message.type,
        content,
        audioUrl: message.audioUrl ?? null,
        audioDuration: message.audioDuration ?? null,
        fileUrl: (message as any).fileUrl ?? null,
        fileName: (message as any).fileName ?? null,
        fileSize: (message as any).fileSize ?? null,
        videoNoteUrl: (message as any).videoNoteUrl ?? null,
        videoNoteDuration: (message as any).videoNoteDuration ?? null,
        linkPreview: (() => { try { const j = (message as any).linkPreviewJson; return j ? JSON.parse(j) : null } catch { return null } })(),
        replyToId: message.replyToId ?? null,
        replyTo: (message as any).replyTo ? {
          id: (message as any).replyTo.id,
          senderId: (message as any).replyTo.senderId,
          senderUsername: (message as any).replyTo.sender?.username ?? null,
          content: decryptText((message as any).replyTo.encryptedContent),
        } : null,
        isEdited: false,
        isForwarded: message.isForwarded,
        forwardedFromUsername: message.forwardedFromUsername ?? null,
        forwardedFromChatId: (message as any).forwardedFromChatId ?? null,
        createdAt: message.createdAt.toISOString(),
        reactions: [],
      }
    })
  } catch (error) {
    console.error('Send message error:', error)
    return NextResponse.json({ error: 'Ошибка при сохранении сообщения' }, { status: 500 })
  }
}

