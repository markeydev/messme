import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canAccessClipVideo, getSession } from '@/lib/clipme'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? '20')
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.round(limitRaw))) : 20

    const raw = await db.clipMeVideo.findMany({
      orderBy: { createdAt: 'desc' },
      take: 120,
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, isBadgeVerified: true } },
        likes: { where: { userId: session.userId }, select: { id: true } },
        reposts: { where: { userId: session.userId }, select: { id: true } },
        _count: { select: { likes: true, reposts: true, comments: true, views: true } },
      },
    })

    const visible: typeof raw = []
    for (const video of raw) {
      if (await canAccessClipVideo(session.userId, video.userId, video.privacy)) {
        visible.push(video)
      }
      if (visible.length >= limit) break
    }

    return NextResponse.json({
      videos: visible.map(video => ({
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
      })),
    })
  } catch (error) {
    console.error('ClipMe feed error:', error)
    return NextResponse.json({ error: 'Ошибка при получении ленты ClipMe' }, { status: 500 })
  }
}
