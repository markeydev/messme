import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/clipme'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await request.json()
    const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : ''
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const privacy = body?.privacy === 'FOLLOWERS' || body?.privacy === 'PRIVATE' ? body.privacy : 'PUBLIC'

    if (!videoUrl) return NextResponse.json({ error: 'videoUrl обязателен' }, { status: 400 })

    const video = await db.clipMeVideo.create({
      data: {
        userId: session.userId,
        videoUrl,
        description: description.slice(0, 2000),
        privacy,
      },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
      },
    })

    return NextResponse.json({
      video: {
        id: video.id,
        user: video.user,
        videoUrl: video.videoUrl,
        description: video.description,
        privacy: video.privacy,
        createdAt: video.createdAt,
        viewsCount: 0,
        likesCount: 0,
        repostsCount: 0,
        commentsCount: 0,
        likedByMe: false,
        repostedByMe: false,
      },
    })
  } catch (error) {
    console.error('ClipMe create video error:', error)
    return NextResponse.json({ error: 'Ошибка при создании ролика' }, { status: 500 })
  }
}
