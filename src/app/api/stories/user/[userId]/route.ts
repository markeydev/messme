import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

async function hasAccessToUserStories(sessionUserId: string, targetUserId: string) {
  if (sessionUserId === targetUserId) return true
  const commonChat = await db.chatMember.findFirst({
    where: {
      userId: sessionUserId,
      chat: {
        members: {
          some: { userId: targetUserId },
        },
      },
    },
    select: { id: true },
  })
  return !!commonChat
}

// GET /api/stories/user/[userId] — active stories for user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { userId } = await params
    const allowed = await hasAccessToUserStories(session.userId, userId)
    if (!allowed) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const now = new Date()
    const isOwner = session.userId === userId

    const stories = await db.story.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, username: true, avatarUrl: true },
        },
        views: {
          include: {
            viewer: {
              select: { id: true, username: true, avatarUrl: true },
            },
          },
        },
        likes: {
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true },
            },
          },
        },
      },
    })

    return NextResponse.json({
      stories: stories.map(story => ({
        id: story.id,
        user: story.user,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        videoDuration: story.videoDuration,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        viewsCount: story.views.length,
        likesCount: story.likes.length,
        likedByMe: story.likes.some(l => l.userId === session.userId),
        seenByMe: story.views.some(v => v.viewerId === session.userId),
        viewers: isOwner ? story.views.map(v => v.viewer) : [],
        likes: isOwner ? story.likes.map(l => l.user) : [],
      })),
    })
  } catch (error) {
    console.error('Get user stories error:', error)
    return NextResponse.json({ error: 'Ошибка при получении сторис' }, { status: 500 })
  }
}
