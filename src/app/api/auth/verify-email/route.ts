import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { hasAdminAccess } from '@/lib/admin'

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json()

    if (!email || !code) {
      return NextResponse.json({ error: 'Email и код обязательны' }, { status: 400 })
    }

    const record = await db.verificationCode.findFirst({
      where: { email, code, type: 'email_verify' },
      orderBy: { createdAt: 'desc' },
    })

    if (!record) {
      return NextResponse.json({ error: 'Неверный код' }, { status: 400 })
    }

    if (record.expiresAt < new Date()) {
      await db.verificationCode.delete({ where: { id: record.id } })
      return NextResponse.json({ error: 'Код истёк, запросите новый' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    }

    if (user.isBlocked) {
      return NextResponse.json({ error: 'Ваш аккаунт заблокирован' }, { status: 403 })
    }

    await db.user.update({ where: { id: user.id }, data: { isVerified: true } })
    await db.verificationCode.deleteMany({ where: { email, type: 'email_verify' } })

    const token = randomUUID()
    await db.session.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
        isBadgeVerified: user.isBadgeVerified,
        isAdmin: hasAdminAccess(user),
        isBlocked: user.isBlocked,
      },
      token,
    })
  } catch (error) {
    console.error('Verify email error:', error)
    return NextResponse.json({ error: 'Ошибка при проверке кода' }, { status: 500 })
  }
}
