import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canAccessClipVideo, getSession } from '@/lib/clipme'
import { sendPushToUsers } from '@/lib/pushNotifications'

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

    const existing = await db.clipMeLike.findUnique({
      where: { videoId_userId: { videoId, userId: session.userId } },
    })
    if (existing) {
      await db.clipMeLike.delete({ where: { id: existing.id } })
    } else {
      await db.clipMeLike.create({ data: { videoId, userId: session.userId } })
      if (video.userId !== session.userId) {
        const actor = await db.user.findUnique({ where: { id: session.userId }, select: { username: true } })
        sendPushToUsers(
          [video.userId],
          { title: actor?.username ?? 'Новый лайк', body: 'Понравился ваш ролик ClipMe', url: `/?tab=clipme&clip=${videoId}` }
        ).catch(() => {})
      }
    }
    const likesCount = await db.clipMeLike.count({ where: { videoId } })

    return NextResponse.json({ liked: !existing, likesCount })
  } catch (error) {
    console.error('ClipMe like error:', error)
    return NextResponse.json({ error: 'Ошибка лайка' }, { status: 500 })
  }
}
