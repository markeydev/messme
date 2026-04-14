import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminByPanelToken } from '@/lib/admin-panel-auth'
import { isPrimaryAdminEmail } from '@/lib/admin'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    const body = await request.json().catch(() => ({}))
    const panelToken = typeof body?.token === 'string' ? body.token : ''

    if (!panelToken) return NextResponse.json({ error: 'Требуется токен панели' }, { status: 401 })

    const admin = await getAdminByPanelToken(panelToken)
    if (!admin) return NextResponse.json({ error: 'Недействительная или истекшая ссылка' }, { status: 401 })

    if (admin.adminId === userId) {
      return NextResponse.json({ error: 'Нельзя удалить самого себя' }, { status: 400 })
    }

    const target = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    })
    if (!target) return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    if (isPrimaryAdminEmail(target.email)) {
      return NextResponse.json({ error: 'Главного администратора удалять нельзя' }, { status: 400 })
    }

    await db.user.delete({ where: { id: userId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin delete user error:', error)
    return NextResponse.json({ error: 'Ошибка удаления пользователя' }, { status: 500 })
  }
}
