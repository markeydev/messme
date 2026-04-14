import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminByPanelToken } from '@/lib/admin-panel-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    const body = await request.json()
    const panelToken = typeof body?.token === 'string' ? body.token : ''
    const verified = Boolean(body?.verified)

    if (!panelToken) return NextResponse.json({ error: 'Требуется токен панели' }, { status: 401 })

    const admin = await getAdminByPanelToken(panelToken)
    if (!admin) return NextResponse.json({ error: 'Недействительная или истекшая ссылка' }, { status: 401 })

    const updated = await db.user.update({
      where: { id: userId },
      data: { isBadgeVerified: verified },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        isVerified: true,
        isBadgeVerified: true,
        isBlocked: true,
        isAdmin: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ user: updated })
  } catch (error) {
    console.error('Admin verify user error:', error)
    return NextResponse.json({ error: 'Ошибка верификации пользователя' }, { status: 500 })
  }
}
