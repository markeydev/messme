import { NextRequest, NextResponse } from 'next/server'

const TIMEOUT_MS = 5000
const MAX_BYTES = 5_000_000 // 5 MB cap

// GET /api/link-preview/image?url=https://...
// Proxies remote OG images so the client's IP is never sent to third-party servers.
export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')
  if (!rawUrl) return new NextResponse(null, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return new NextResponse(null, { status: 400 })
    }
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  // SSRF guard
  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname) ||
    /^192\.168\.\d+\.\d+$/.test(hostname)
  ) {
    return new NextResponse(null, { status: 403 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(parsed.href, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MessmeLinkBot/1.0)' },
      redirect: 'follow',
    })
    clearTimeout(timer)

    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return new NextResponse(null, { status: 422 })
    }

    // Stream with size cap
    const reader = res.body?.getReader()
    if (!reader) return new NextResponse(null, { status: 502 })

    let bytes = 0
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      bytes += value.byteLength
      if (bytes >= MAX_BYTES) break
    }
    reader.cancel().catch(() => {})

    const merged = new Uint8Array(bytes)
    let offset = 0
    for (const c of chunks) { merged.set(c, offset); offset += c.byteLength }

    return new NextResponse(merged, {
      headers: {
        'Content-Type': contentType.split(';')[0],
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
