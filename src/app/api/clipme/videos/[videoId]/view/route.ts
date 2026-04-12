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

    const body = await request.json().catch(() => ({}))
    const watchedMsRaw = Number(body?.watchedMs ?? 0)
    const watchedMs = Number.isFinite(watchedMsRaw) ? watchedMsRaw : 0
    const completed = body?.completed === true
    const meaningfulView = completed || watchedMs >= 1200
    if (!meaningfulView) {
      const viewsCount = await db.clipMeView.count({ where: { videoId } })
      return NextResponse.json({ viewed: false, viewsCount })
    }

    const existingView = await db.clipMeView.findUnique({
      where: { videoId_userId: { videoId, userId: session.userId } },
      select: { id: true },
    })
    if (!existingView) {
      await db.clipMeView.create({
        data: { videoId, userId: session.userId },
      })
    }

    const viewsCount = await db.clipMeView.count({ where: { videoId } })

    return NextResponse.json({ viewed: true, viewsCount })
  } catch (error) {
    console.error('ClipMe view track error:', error)
    return NextResponse.json({ error: 'Ошибка фиксации просмотра' }, { status: 500 })
  }
}
