import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { deleteFromS3 } from '@/lib/s3'
import { encryptText } from '@/lib/serverCrypto'

// Extract the S3 key from a full public URL (e.g. https://s3.firstvds.ru/atymarket/voice/…)
function urlToS3Key(url: string): string | null {
  try {
    const bucket = process.env.S3_BUCKET
    if (!bucket) return null
    // URL format: <endpoint>/<bucket>/<key>
    const marker = `/${bucket}/`
    const idx = url.indexOf(marker)
    if (idx === -1) return null
    return url.slice(idx + marker.length)
  } catch {
    return null
  }
}

async function getValidSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { id: chatId, messageId } = await params
    const session = await getValidSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const message = await db.message.findUnique({ where: { id: messageId } })
    if (!message || message.chatId !== chatId) {
      return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
    }
    if (message.senderId !== session.userId) {
      return NextResponse.json({ error: 'Нет прав на удаление' }, { status: 403 })
    }

    await db.message.delete({ where: { id: messageId } })

    // Delete associated S3 objects (fire-and-forget, don't fail the request if S3 errors)
    const s3Urls: (string | null)[] = [
      (message as any).audioUrl ?? null,
      (message as any).fileUrl ?? null,
      (message as any).videoNoteUrl ?? null,
    ]
    for (const url of s3Urls) {
      if (!url) continue
      const key = urlToS3Key(url)
      if (key) deleteFromS3(key).catch(e => console.error('S3 delete failed:', key, e))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete message error:', error)
    return NextResponse.json({ error: 'Ошибка при удалении' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const { id: chatId, messageId } = await params
    const session = await getValidSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const message = await db.message.findUnique({ where: { id: messageId } })
    if (!message || message.chatId !== chatId) {
      return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 })
    }
    if (message.senderId !== session.userId) {
      return NextResponse.json({ error: 'Нет прав на редактирование' }, { status: 403 })
    }

    const body = await request.json()
    const { content } = body
    if (!content) {
      return NextResponse.json({ error: 'Контент обязателен' }, { status: 400 })
    }

    const updated = await db.message.update({
      where: { id: messageId },
      data: { encryptedContent: encryptText(content), isEdited: true },
      include: { sender: { select: { username: true } } }
    })

    return NextResponse.json({
      message: {
        id: updated.id,
        chatId: updated.chatId,
        senderId: updated.senderId,
        senderUsername: updated.sender.username,
        content,
        replyToId: updated.replyToId ?? null,
        isEdited: updated.isEdited,
        createdAt: updated.createdAt.toISOString(),
      }
    })
  } catch (error) {
    console.error('Edit message error:', error)
    return NextResponse.json({ error: 'Ошибка при редактировании' }, { status: 500 })
  }
}
