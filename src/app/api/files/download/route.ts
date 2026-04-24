import { NextRequest, NextResponse } from 'next/server'

const FALLBACK_TYPE = 'application/octet-stream'
const ALLOWED_S3_HOST = (() => {
  try {
    return process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).host : null
  } catch {
    return null
  }
})()

function sanitizeFileName(input: string) {
  return input
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 180) || 'file'
}

function isAllowedHost(target: URL) {
  return !!ALLOWED_S3_HOST && target.host === ALLOWED_S3_HOST
}

export async function GET(request: NextRequest) {
  try {
    const sourceUrl = request.nextUrl.searchParams.get('url')
    const sourceName = request.nextUrl.searchParams.get('name') ?? 'file'
    if (!sourceUrl) {
      return NextResponse.json({ error: 'url обязателен' }, { status: 400 })
    }

    const target = new URL(sourceUrl)
    if (!isAllowedHost(target)) {
      return NextResponse.json({ error: 'Недопустимый источник файла' }, { status: 400 })
    }

    const upstream = await fetch(target.toString())
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'Файл не найден' }, { status: 404 })
    }

    const fileName = sanitizeFileName(sourceName)
    // Keep both filename and filename* for better compatibility across old/new clients.
    const fallbackFileName = fileName.replace(/"/g, '')
    const contentType = upstream.headers.get('content-type') || FALLBACK_TYPE
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fallbackFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (error) {
    console.error('File download proxy error:', error)
    return NextResponse.json({ error: 'Ошибка скачивания файла' }, { status: 500 })
  }
}
