import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminByPanelToken } from '@/lib/admin-panel-auth'
import { isPrimaryAdminEmail } from '@/lib/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    const body = await request.json()
    const panelToken = typeof body?.token === 'string' ? body.token : ''
    const isAdmin = Boolean(body?.isAdmin)

    if (!panelToken) return NextResponse.json({ error: 'Требуется токен панели' }, { status: 401 })

    const admin = await getAdminByPanelToken(panelToken)
    if (!admin) return NextResponse.json({ error: 'Недействительная или истекшая ссылка' }, { status: 401 })

    // Only primary admin can promote/demote admins
    const adminUser = await db.user.findUnique({
      where: { id: admin.adminId },
      select: { email: true },
    })
    if (!isPrimaryAdminEmail(adminUser?.email)) {
      return NextResponse.json({ error: 'Только главный администратор может управлять правами' }, { status: 403 })
    }

    if (admin.adminId === userId) {
      return NextResponse.json({ error: 'Нельзя изменить собственные права' }, { status: 400 })
    }

    const target = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })
    if (!target) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    if (isPrimaryAdminEmail(target.email)) {
      return NextResponse.json({ error: 'Нельзя изменить права главного администратора' }, { status: 400 })
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { isAdmin },
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
    console.error('Admin set-admin error:', error)
    return NextResponse.json({ error: 'Ошибка обновления прав' }, { status: 500 })
  }
}
