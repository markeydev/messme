import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/clipme'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const { videoId } = await params

    const video = await db.clipMeVideo.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true },
    })
    if (!video) return NextResponse.json({ error: 'Ролик не найден' }, { status: 404 })
    if (video.userId !== session.userId) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const body = await request.json()
    const privacy = body?.privacy === 'FOLLOWERS' || body?.privacy === 'PRIVATE' ? body.privacy : 'PUBLIC'
    const updated = await db.clipMeVideo.update({
      where: { id: videoId },
      data: { privacy },
      select: { id: true, privacy: true },
    })
    return NextResponse.json({ video: updated })
  } catch (error) {
    console.error('ClipMe privacy update error:', error)
    return NextResponse.json({ error: 'Ошибка изменения приватности' }, { status: 500 })
  }
}
