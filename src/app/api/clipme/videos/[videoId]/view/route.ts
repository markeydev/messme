import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canAccessClipVideo, getSession } from '@/lib/clipme'

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

    await db.clipMeView.upsert({
      where: { videoId_userId: { videoId, userId: session.userId } },
      create: { videoId, userId: session.userId },
      update: {},
    })

    const viewsCount = await db.clipMeView.count({ where: { videoId } })

    return NextResponse.json({ viewed: true, viewsCount })
  } catch (error) {
    console.error('ClipMe view track error:', error)
    return NextResponse.json({ error: 'Ошибка фиксации просмотра' }, { status: 500 })
  }
}
