import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendPushToUsers } from '@/lib/pushNotifications'

async function getSession(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const session = await db.session.findUnique({ where: { token } })
  if (!session || session.expiresAt < new Date()) return null
  return session
}

async function hasAccessToStory(sessionUserId: string, storyOwnerId: string) {
  if (sessionUserId === storyOwnerId) return true
  const commonChat = await db.chatMember.findFirst({
    where: {
      userId: sessionUserId,
      chat: {
        members: {
          some: { userId: storyOwnerId },
        },
      },
    },
    select: { id: true },
  })
  return !!commonChat
}

// POST /api/stories/[storyId]/like — toggle like
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storyId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const { storyId } = await params
    const story = await db.story.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true, expiresAt: true },
    })

    if (!story || story.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'Сторис не найдена' }, { status: 404 })
    }

    if (story.userId === session.userId) {
      return NextResponse.json({ error: 'Нельзя лайкнуть свою сторис' }, { status: 400 })
    }

    const allowed = await hasAccessToStory(session.userId, story.userId)
    if (!allowed) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const existing = await db.storyLike.findUnique({
      where: {
        storyId_userId: {
          storyId: story.id,
          userId: session.userId,
        },
      },
      select: { id: true },
    })

    let liked = false
    if (existing) {
      await db.storyLike.delete({ where: { id: existing.id } })
    } else {
      await db.storyLike.create({
        data: {
          storyId: story.id,
          userId: session.userId,
        },
      })
      liked = true
      const actor = await db.user.findUnique({
        where: { id: session.userId },
        select: { username: true },
      })
      await sendPushToUsers(
        [story.userId],
        {
          title: actor?.username ?? 'Новый лайк',
          body: 'Лайкнул(а) вашу сторис',
          url: '/',
        }
      )
    }

    const likesCount = await db.storyLike.count({ where: { storyId: story.id } })
    return NextResponse.json({ liked, likesCount })
  } catch (error) {
    console.error('Toggle story like error:', error)
    return NextResponse.json({ error: 'Ошибка при лайке сторис' }, { status: 500 })
  }
}
