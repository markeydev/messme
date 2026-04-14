import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hasAdminAccess } from '@/lib/admin'
import { ensureAdminbotUser } from '@/lib/adminbot'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const session = await db.session.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isAdmin: true,
            isBlocked: true,
          },
        },
      },
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Сессия истекла' }, { status: 401 })
    }
    if (session.user.isBlocked) {
      return NextResponse.json({ error: 'Аккаунт заблокирован' }, { status: 403 })
    }
    if (!hasAdminAccess(session.user)) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    }

    await ensureAdminbotUser()

    const panelToken = randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await db.adminPanelLinkToken.create({
      data: {
        token: panelToken,
        userId: session.user.id,
        expiresAt,
      },
    })

    const explicitBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_PUBLIC_URL ?? ''
    const normalizedBaseUrl = explicitBaseUrl.trim().replace(/\/+$/, '')
    const baseUrl = normalizedBaseUrl || request.nextUrl.origin
    const panelUrl = `${baseUrl}/admin/panel?token=${encodeURIComponent(panelToken)}`
    return NextResponse.json({
      url: panelUrl,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    console.error('Generate admin panel link error:', error)
    return NextResponse.json({ error: 'Не удалось сгенерировать ссылку' }, { status: 500 })
  }
}
