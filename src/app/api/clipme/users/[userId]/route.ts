import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canAccessClipVideo, getSession } from '@/lib/clipme'
import { decryptText } from '@/lib/serverCrypto'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const { userId } = await params

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, avatarUrl: true, clipMeBio: true, linkedMessmeChannelId: true, isBadgeVerified: true },
    })
    if (!user) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })

    const [followersCount, followingCount, mySub] = await Promise.all([
      db.clipMeSubscription.count({ where: { followingId: userId } }),
      db.clipMeSubscription.count({ where: { followerId: userId } }),
      db.clipMeSubscription.findUnique({
        where: { followerId_followingId: { followerId: session.userId, followingId: userId } },
        select: { id: true },
      }),
    ])

    const linkedMessmeChannel = user.linkedMessmeChannelId
      ? await db.chat.findFirst({
          where: { id: user.linkedMessmeChannelId, isPersonalChannel: true },
          select: {
            id: true,
            title: true,
            _count: { select: { members: true } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                type: true,
                encryptedContent: true,
                fileName: true,
              },
            },
          },
        })
      : null

    const videosRaw = await db.clipMeVideo.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { likes: true, reposts: true, comments: true, views: true } },
        likes: { where: { userId: session.userId }, select: { id: true } },
        reposts: { where: { userId: session.userId }, select: { id: true } },
      },
    })

    const repostsRaw = await db.clipMeRepost.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        video: {
          include: {
            user: { select: { id: true, username: true, avatarUrl: true, clipMeBio: true, linkedMessmeChannelId: true, isBadgeVerified: true } },
            likes: { where: { userId: session.userId }, select: { id: true } },
            reposts: { where: { userId: session.userId }, select: { id: true } },
            _count: { select: { likes: true, reposts: true, comments: true, views: true } },
          },
        },
      },
    })

    const videos = []
    for (const v of videosRaw) {
      if (await canAccessClipVideo(session.userId, userId, v.privacy)) {
        videos.push({
          id: v.id,
          user: user,
          videoUrl: v.videoUrl,
          description: v.description,
          privacy: v.privacy,
          createdAt: v.createdAt,
          viewsCount: v._count.views,
          likesCount: v._count.likes,
          repostsCount: v._count.reposts,
          commentsCount: v._count.comments,
          likedByMe: v.likes.length > 0,
          repostedByMe: v.reposts.length > 0,
        })
      }
    }

    const reposts = []
    for (const repost of repostsRaw) {
      const v = repost.video
      if (await canAccessClipVideo(session.userId, v.userId, v.privacy)) {
        reposts.push({
          id: v.id,
          user: v.user,
          videoUrl: v.videoUrl,
          description: v.description,
          privacy: v.privacy,
          createdAt: v.createdAt,
          viewsCount: v._count.views,
          likesCount: v._count.likes,
          repostsCount: v._count.reposts,
          commentsCount: v._count.comments,
          likedByMe: v.likes.length > 0,
          repostedByMe: v.reposts.length > 0,
        })
      }
    }

    return NextResponse.json({
      user,
      linkedMessmeChannel: linkedMessmeChannel ? {
        id: linkedMessmeChannel.id,
        title: linkedMessmeChannel.title ?? 'Канал',
        subscribersCount: linkedMessmeChannel._count.members,
        lastMessageText: (() => {
          const msg = linkedMessmeChannel.messages[0]
          if (!msg) return null
          if (msg.type === 'TEXT') return decryptText(msg.encryptedContent)
          if (msg.type === 'AUDIO') return '🎤 Голосовое сообщение'
          if (msg.type === 'IMAGE') return '🖼 Фото'
          if (msg.type === 'FILE') return `📎 ${msg.fileName ?? 'Файл'}`
          if (msg.type === 'VIDEO_NOTE') return '🎥 Видеосообщение'
          return null
        })(),
      } : null,
      followersCount,
      followingCount,
      subscribedByMe: !!mySub,
      videos,
      reposts,
    })
  } catch (error) {
    console.error('ClipMe user channel read error:', error)
    return NextResponse.json({ error: 'Ошибка загрузки канала пользователя' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    const { userId } = await params
    if (session.userId !== userId) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })

    const body = await request.json()
    const clipMeBioRaw = typeof body?.clipMeBio === 'string' ? body.clipMeBio : ''
    const clipMeBio = clipMeBioRaw.trim().slice(0, 240)

    const user = await db.user.update({
      where: { id: userId },
      data: { clipMeBio: clipMeBio.length > 0 ? clipMeBio : null },
      select: { id: true, username: true, avatarUrl: true, clipMeBio: true, linkedMessmeChannelId: true, isBadgeVerified: true },
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('ClipMe bio update error:', error)
    return NextResponse.json({ error: 'Ошибка обновления описания канала' }, { status: 500 })
  }
}
