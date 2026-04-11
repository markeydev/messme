import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { uploadToS3 } from '@/lib/s3'
import { STORY_MAX_VIDEO_DURATION_SECONDS } from '@/lib/stories'
import { randomUUID } from 'crypto'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml']
const STORY_VIDEO_TYPES = ['video/webm', 'video/mp4', 'video/quicktime']
const MAX_AUDIO  = 10  * 1024 * 1024   //  10 MB
const MAX_IMAGE  = 20  * 1024 * 1024   //  20 MB
const MAX_STORY_VIDEO = 50 * 1024 * 1024 // 50 MB
const MAX_CLIPME_VIDEO = 200 * 1024 * 1024 // 200 MB
const MAX_FILE   = 100 * 1024 * 1024   // 100 MB

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const session = await db.session.findUnique({ where: { token } })
    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const duration = formData.get('duration')

    if (!file) return NextResponse.json({ error: 'Файл не передан' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const purpose = formData.get('purpose') as string | null

    // ── Avatar ────────────────────────────────────────────────────────────
    if (purpose === 'avatar_user' || purpose === 'avatar_group') {
      if (!IMAGE_TYPES.includes(file.type))
        return NextResponse.json({ error: 'Только изображения' }, { status: 400 })
      if (file.size > MAX_IMAGE)
        return NextResponse.json({ error: 'Изображение слишком большое (макс. 20 МБ)' }, { status: 400 })
      const rawExt = file.type.split('/')[1] ?? 'jpg'
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt === 'svg+xml' ? 'svg' : rawExt
      const folder = purpose === 'avatar_user' ? 'avatars/users' : 'avatars/groups'
      const key = `${folder}/${session.userId}/${randomUUID()}.${ext}`
      const url = await uploadToS3(key, buffer, file.type)
      return NextResponse.json({ url })
    }

    // ── Video note ────────────────────────────────────────────────────────
    if (purpose === 'videonote' && file.type.startsWith('video/')) {
      if (file.size > 50 * 1024 * 1024)
        return NextResponse.json({ error: 'Видео слишком большое (макс. 50 МБ)' }, { status: 400 })
      const ext = file.type.includes('mp4') ? 'mp4' : 'webm'
      const key = `videonotes/${session.userId}/${randomUUID()}.${ext}`
      const url = await uploadToS3(key, buffer, file.type)
      return NextResponse.json({ url, duration: duration ? Math.round(Number(duration)) : null })
    }

    // ── Story media ───────────────────────────────────────────────────────
    if (purpose === 'story') {
      if (IMAGE_TYPES.includes(file.type)) {
        if (file.size > MAX_IMAGE)
          return NextResponse.json({ error: 'Изображение слишком большое (макс. 20 МБ)' }, { status: 400 })
        const rawExt = file.type.split('/')[1] ?? 'jpg'
        const ext = rawExt === 'jpeg' ? 'jpg' : rawExt === 'svg+xml' ? 'svg' : rawExt
        const key = `stories/${session.userId}/${randomUUID()}.${ext}`
        const url = await uploadToS3(key, buffer, file.type)
        return NextResponse.json({ url, mediaType: 'IMAGE', duration: null })
      }

      if (STORY_VIDEO_TYPES.includes(file.type)) {
        const parsedDuration = duration ? Number(duration) : NaN
        if (!Number.isFinite(parsedDuration) || parsedDuration <= 0 || parsedDuration > STORY_MAX_VIDEO_DURATION_SECONDS) {
          return NextResponse.json({ error: `Видео для сторис должно быть до ${STORY_MAX_VIDEO_DURATION_SECONDS} секунд` }, { status: 400 })
        }
        if (file.size > MAX_STORY_VIDEO)
          return NextResponse.json({ error: 'Видео слишком большое (макс. 50 МБ)' }, { status: 400 })
        const ext = file.type.includes('mp4') ? 'mp4' : file.type.includes('quicktime') ? 'mov' : 'webm'
        const key = `stories/${session.userId}/${randomUUID()}.${ext}`
        const url = await uploadToS3(key, buffer, file.type)
        return NextResponse.json({ url, mediaType: 'VIDEO', duration: Math.round(parsedDuration) })
      }

      return NextResponse.json({ error: 'Для сторис доступны только фото и видео' }, { status: 400 })
    }

    // ── ClipMe video ────────────────────────────────────────────────────────
    if (purpose === 'clipme') {
      if (!file.type.startsWith('video/')) {
        return NextResponse.json({ error: 'Для ClipMe доступно только видео' }, { status: 400 })
      }
      if (file.size > MAX_CLIPME_VIDEO) {
        return NextResponse.json({ error: 'Видео слишком большое (макс. 200 МБ)' }, { status: 400 })
      }
      const ext = file.type.includes('mp4') ? 'mp4' : file.type.includes('quicktime') ? 'mov' : 'webm'
      const key = `clipme/${session.userId}/${randomUUID()}.${ext}`
      const url = await uploadToS3(key, buffer, file.type)
      return NextResponse.json({ url, mediaType: 'VIDEO', duration: duration ? Math.round(Number(duration)) : null })
    }

    // ── Audio ─────────────────────────────────────────────────────────────
    if (file.type.startsWith('audio/')) {
      if (file.size > MAX_AUDIO)
        return NextResponse.json({ error: 'Аудио слишком большое (макс. 10 МБ)' }, { status: 400 })
      const ext = file.type.includes('ogg') ? 'ogg' : file.type.includes('mp4') ? 'm4a' : 'webm'
      const key = `voice/${session.userId}/${randomUUID()}.${ext}`
      const url = await uploadToS3(key, buffer, file.type)
      return NextResponse.json({ url, duration: duration ? Math.round(Number(duration)) : null })
    }

    // ── Image ─────────────────────────────────────────────────────────────
    if (IMAGE_TYPES.includes(file.type)) {
      if (file.size > MAX_IMAGE)
        return NextResponse.json({ error: 'Изображение слишком большое (макс. 20 МБ)' }, { status: 400 })
      const rawExt = file.type.split('/')[1] ?? 'jpg'
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt === 'svg+xml' ? 'svg' : rawExt
      const key = `images/${session.userId}/${randomUUID()}.${ext}`
      const url = await uploadToS3(key, buffer, file.type)
      return NextResponse.json({ url, fileName: file.name, fileSize: file.size })
    }

    // ── Generic file ──────────────────────────────────────────────────────
    if (file.size > MAX_FILE)
      return NextResponse.json({ error: 'Файл слишком большой (макс. 100 МБ)' }, { status: 400 })

    const dotIdx = file.name.lastIndexOf('.')
    const ext = dotIdx !== -1 ? file.name.slice(dotIdx) : ''
    const key = `files/${session.userId}/${randomUUID()}${ext}`
    const url = await uploadToS3(key, buffer, file.type || 'application/octet-stream')
    return NextResponse.json({ url, fileName: file.name, fileSize: file.size })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Ошибка загрузки' }, { status: 500 })
  }
}
