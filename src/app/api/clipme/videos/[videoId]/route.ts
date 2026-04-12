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
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        likes: { where: { userId: session.userId }, select: { id: true } },
        reposts: { where: { userId: session.userId }, select: { id: true } },
        _count: { select: { likes: true, reposts: true, comments: true, views: true } },
      },
    })

    if (!video) return NextResponse.json({ error: 'Ролик не найден' }, { status: 404 })
    if (!(await canAccessClipVideo(session.userId, video.userId, video.privacy))) {
      return NextResponse.json({ error: 'Нет доступа к ролику' }, { status: 403 })
    }

    return NextResponse.json({
      video: {
        id: video.id,
        user: video.user,
        videoUrl: video.videoUrl,
        description: video.description,
        privacy: video.privacy,
        createdAt: video.createdAt,
        viewsCount: video._count.views,
        likesCount: video._count.likes,
        repostsCount: video._count.reposts,
        commentsCount: video._count.comments,
        likedByMe: video.likes.length > 0,
        repostedByMe: video.reposts.length > 0,
      },
    })
  } catch (error) {
    console.error('ClipMe single video error:', error)
    return NextResponse.json({ error: 'Ошибка загрузки ролика' }, { status: 500 })
  }
}
