import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canAccessClipVideo, getSession } from '@/lib/clipme'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const { videoId } = await params

    const video = await db.clipMeVideo.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, privacy: true },
    })
    if (!video) return NextResponse.json({ error: 'Ролик не найден' }, { status: 404 })
    if (!(await canAccessClipVideo(session.userId, video.userId, video.privacy))) {
      return NextResponse.json({ error: 'Нет доступа к ролику' }, { status: 403 })
    }

    const comments = await db.clipMeComment.findMany({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, isBadgeVerified: true } },
        likes: { where: { userId: session.userId }, select: { id: true } },
        _count: { select: { replies: true, likes: true } },
      },
    })
    return NextResponse.json({
      comments: comments.map(c => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        parentId: c.parentId,
        repliesCount: c._count.replies,
        likesCount: c._count.likes,
        likedByMe: c.likes.length > 0,
        user: c.user,
      })),
    })
  } catch (error) {
    console.error('ClipMe comments read error:', error)
    return NextResponse.json({ error: 'Ошибка загрузки комментариев' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const { videoId } = await params

    const video = await db.clipMeVideo.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, privacy: true },
    })
    if (!video) return NextResponse.json({ error: 'Ролик не найден' }, { status: 404 })
    if (!(await canAccessClipVideo(session.userId, video.userId, video.privacy))) {
      return NextResponse.json({ error: 'Нет доступа к ролику' }, { status: 403 })
    }

    const body = await request.json()
    const content = typeof body?.content === 'string' ? body.content.trim() : ''
    const parentId = typeof body?.parentId === 'string' ? body.parentId.trim() : ''
    if (!content) return NextResponse.json({ error: 'Комментарий не может быть пустым' }, { status: 400 })

    let normalizedParentId: string | null = null
    if (parentId) {
      const parent = await db.clipMeComment.findFirst({
        where: { id: parentId, videoId },
        select: { id: true },
      })
      if (!parent) return NextResponse.json({ error: 'Родительский комментарий не найден' }, { status: 404 })
      normalizedParentId = parent.id
    }

    const comment = await db.clipMeComment.create({
      data: {
        videoId,
        userId: session.userId,
        parentId: normalizedParentId,
        content: content.slice(0, 1000),
      },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, isBadgeVerified: true } },
      },
    })

    const commentsCount = await db.clipMeComment.count({ where: { videoId } })
    return NextResponse.json({
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        parentId: comment.parentId,
        repliesCount: 0,
        likesCount: 0,
        likedByMe: false,
        user: comment.user,
      },
      commentsCount,
    })
  } catch (error) {
    console.error('ClipMe comment create error:', error)
    return NextResponse.json({ error: 'Ошибка добавления комментария' }, { status: 500 })
  }
}
