import { NextRequest, NextResponse } from 'next/server'

const TIMEOUT_MS = 5000
const MAX_HTML_BYTES = 500_000 // read at most 500 KB to find OG tags

function extractMeta(html: string, property: string): string | null {
  // og:property — <meta property="og:..." content="..." />
  const ogRe = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i'
  )
  const ogReRev = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
    'i'
  )
  return (
    html.match(ogRe)?.[1] ??
    html.match(ogReRev)?.[1] ??
    null
  )
}

function extractTitle(html: string): string | null {
  return html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1]?.trim() ?? null
}

function resolveUrl(base: string, target: string): string | null {
  try {
    return new URL(target, base).href
  } catch {
    return null
  }
}

// GET /api/link-preview?url=https://...
export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')
  if (!rawUrl) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  // Only allow http/https
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  // Block SSRF — private/loopback ranges
  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname) ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^169\.254\.\d+\.\d+$/.test(hostname) ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return NextResponse.json({ error: 'Forbidden host' }, { status: 403 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(parsed.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MessmeLinkBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    clearTimeout(timer)

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      return NextResponse.json({ error: 'Not HTML' }, { status: 422 })
    }

    // Stream-read only up to MAX_HTML_BYTES
    const reader = res.body?.getReader()
    if (!reader) return NextResponse.json({ error: 'No body' }, { status: 422 })

    let bytes = 0
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      bytes += value.byteLength
      if (bytes >= MAX_HTML_BYTES) break
    }
    reader.cancel().catch(() => {})
    const html = new TextDecoder().decode(
      new Uint8Array(chunks.reduce<number[]>((a, c) => [...a, ...c], []))
    )

    const title =
      extractMeta(html, 'og:title') ??
      extractMeta(html, 'twitter:title') ??
      extractTitle(html) ??
      parsed.hostname

    const rawDescription =
      extractMeta(html, 'og:description') ??
      extractMeta(html, 'twitter:description') ??
      null

    const rawImage =
      extractMeta(html, 'og:image') ??
      extractMeta(html, 'twitter:image') ??
      extractMeta(html, 'twitter:image:src') ??
      null

    const image = rawImage ? resolveUrl(parsed.href, rawImage) : null

    // Proxy image through our own endpoint so no client IP leaks
    const proxyImage = image
      ? `/api/link-preview/image?url=${encodeURIComponent(image)}`
      : null

    const siteName =
      extractMeta(html, 'og:site_name') ??
      parsed.hostname.replace(/^www\./, '')

    const description = rawDescription && rawDescription.length > 200
      ? rawDescription.slice(0, 200) + '…'
      : rawDescription

    return NextResponse.json(
      { title, description, image: proxyImage, siteName, url: parsed.href },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
        },
      }
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'fetch error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
