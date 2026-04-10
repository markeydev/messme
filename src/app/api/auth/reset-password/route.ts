import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + 'messenger-salt-2024')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(request: NextRequest) {
  try {
    const { email, code, newPassword } = await request.json()

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: 'Все поля обязательны' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Пароль должен содержать минимум 6 символов' }, { status: 400 })
    }

    const record = await db.verificationCode.findFirst({
      where: { email, code, type: 'password_reset' },
      orderBy: { createdAt: 'desc' },
    })

    if (!record) {
      return NextResponse.json({ error: 'Неверный код' }, { status: 400 })
    }

    if (record.expiresAt < new Date()) {
      await db.verificationCode.delete({ where: { id: record.id } })
      return NextResponse.json({ error: 'Код истёк, запросите новый' }, { status: 400 })
    }

    const passwordHash = await hashPassword(newPassword)
    await db.user.update({ where: { email }, data: { passwordHash } })
    await db.verificationCode.deleteMany({ where: { email, type: 'password_reset' } })
    // Invalidate all sessions
    await db.session.deleteMany({ where: { user: { email } } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reset password error:', error)
    return NextResponse.json({ error: 'Ошибка при сбросе пароля' }, { status: 500 })
  }
}
