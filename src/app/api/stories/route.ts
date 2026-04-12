import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { STORY_MAX_VIDEO_DURATION_SECONDS, STORY_TTL_HOURS } from '@/lib/stories'

async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

async function getAccessibleUserIds(userId: string): Promise<string[]> {
  const memberships = await db.chatMember.findMany({
    where: { userId },
    select: {
      chat: {
        select: {
          members: {
            select: { userId: true },
          },
        },
      },
    },
  })
  const ids = new Set<string>([userId])
  memberships.forEach(m => m.chat.members.forEach(cm => ids.add(cm.userId)))
  return [...ids]
}

// GET /api/stories — users with active stories visible for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const now = new Date()
    const visibleUserIds = await getAccessibleUserIds(session.userId)

    const stories = await db.story.findMany({
      where: {
        userId: { in: visibleUserIds },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        views: {
          where: { viewerId: session.userId },
          select: { id: true },
        },
      },
    })

    const grouped = new Map<string, {
      user: { id: string; username: string; avatarUrl: string | null }
      latestStoryAt: Date
      hasUnseen: boolean
      storiesCount: number
    }>()

    for (const story of stories) {
      const current = grouped.get(story.userId)
      const unseen = story.userId !== session.userId && story.views.length === 0
      if (!current) {
        grouped.set(story.userId, {
          user: story.user,
          latestStoryAt: story.createdAt,
          hasUnseen: unseen,
          storiesCount: 1,
        })
      } else {
        current.hasUnseen = current.hasUnseen || unseen
        current.storiesCount += 1
      }
    }

    const users = [...grouped.values()]
      .sort((a, b) => {
        if (a.user.id === session.userId) return -1
        if (b.user.id === session.userId) return 1
        if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1
        return b.latestStoryAt.getTime() - a.latestStoryAt.getTime()
      })
      .map(u => ({
        user: u.user,
        hasUnseen: u.hasUnseen,
        storiesCount: u.storiesCount,
        latestStoryAt: u.latestStoryAt,
      }))

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Get stories feed error:', error)
    return NextResponse.json({ error: 'Ошибка при получении сторис' }, { status: 500 })
  }
}

// POST /api/stories — create story (media already uploaded to S3)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await request.json()
    const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : ''
    const mediaType = body.mediaType === 'VIDEO' ? 'VIDEO' : body.mediaType === 'IMAGE' ? 'IMAGE' : null
    const videoDuration = body.videoDuration === null || body.videoDuration === undefined
      ? null
      : Number(body.videoDuration)

    if (!mediaUrl) return NextResponse.json({ error: 'mediaUrl обязателен' }, { status: 400 })
    if (!mediaType) return NextResponse.json({ error: 'Некорректный mediaType' }, { status: 400 })

    if (mediaType === 'VIDEO') {
      if (!Number.isFinite(videoDuration) || videoDuration <= 0 || videoDuration > STORY_MAX_VIDEO_DURATION_SECONDS) {
        return NextResponse.json({ error: `Видео для сторис должно быть до ${STORY_MAX_VIDEO_DURATION_SECONDS} секунд` }, { status: 400 })
      }
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + STORY_TTL_HOURS * 60 * 60 * 1000)

    const story = await db.story.create({
      data: {
        userId: session.userId,
        mediaUrl,
        mediaType,
        videoDuration: mediaType === 'VIDEO' ? Math.round(videoDuration as number) : null,
        expiresAt,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    })

    return NextResponse.json({
      story: {
        id: story.id,
        user: story.user,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        videoDuration: story.videoDuration,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        viewsCount: 0,
        likesCount: 0,
        likedByMe: false,
        seenByMe: true,
      },
    })
  } catch (error) {
    console.error('Create story error:', error)
    return NextResponse.json({ error: 'Ошибка при создании сторис' }, { status: 500 })
  }
}
