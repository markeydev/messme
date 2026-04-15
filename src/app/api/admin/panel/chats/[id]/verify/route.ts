import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminByPanelToken } from '@/lib/admin-panel-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chatId } = await params
    const body = await request.json()
    const panelToken = typeof body?.token === 'string' ? body.token : ''
    const verified = Boolean(body?.verified)

    if (!panelToken) return NextResponse.json({ error: 'Требуется токен панели' }, { status: 401 })

    const admin = await getAdminByPanelToken(panelToken)
    if (!admin) return NextResponse.json({ error: 'Недействительная или истекшая ссылка' }, { status: 401 })

    const updated = await db.chat.update({
      where: { id: chatId },
      data: { isVerified: verified },
      select: {
        id: true,
        title: true,
        isPersonalChannel: true,
        isVerified: true,
        ownerId: true,
        owner: { select: { id: true, username: true } },
      },
    })

    return NextResponse.json({ chat: updated })
  } catch (error) {
    console.error('Admin verify channel error:', error)
    return NextResponse.json({ error: 'Ошибка верификации канала' }, { status: 500 })
  }
}
