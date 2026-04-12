import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canAccessClipVideo, getSession } from '@/lib/clipme'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { commentId } = await params
    const comment = await db.clipMeComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        video: { select: { id: true, userId: true, privacy: true } },
      },
    })
    if (!comment) return NextResponse.json({ error: 'Комментарий не найден' }, { status: 404 })

    if (!(await canAccessClipVideo(session.userId, comment.video.userId, comment.video.privacy))) {
      return NextResponse.json({ error: 'Нет доступа к ролику' }, { status: 403 })
    }

    const existing = await db.clipMeCommentLike.findUnique({
      where: { commentId_userId: { commentId: comment.id, userId: session.userId } },
      select: { id: true },
    })

    let liked = false
    if (existing) {
      await db.clipMeCommentLike.delete({ where: { id: existing.id } })
    } else {
      await db.clipMeCommentLike.create({
        data: { commentId: comment.id, userId: session.userId },
      })
      liked = true
    }

    const likesCount = await db.clipMeCommentLike.count({ where: { commentId: comment.id } })
    return NextResponse.json({ liked, likesCount })
  } catch (error) {
    console.error('ClipMe comment like error:', error)
    return NextResponse.json({ error: 'Ошибка лайка комментария' }, { status: 500 })
  }
}
