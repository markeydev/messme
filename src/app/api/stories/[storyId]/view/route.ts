import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

// POST /api/stories/[storyId]/view — mark story as viewed
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

    const allowed = await hasAccessToStory(session.userId, story.userId)
    if (!allowed) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    await db.storyView.upsert({
      where: {
        storyId_viewerId: {
          storyId: story.id,
          viewerId: session.userId,
        },
      },
      update: {},
      create: {
        storyId: story.id,
        viewerId: session.userId,
      },
    })

    const viewsCount = await db.storyView.count({ where: { storyId: story.id } })
    return NextResponse.json({ success: true, viewsCount })
  } catch (error) {
    console.error('Mark story viewed error:', error)
    return NextResponse.json({ error: 'Ошибка при отметке просмотра' }, { status: 500 })
  }
}
