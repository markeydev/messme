import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendMail, generateCode } from '@/lib/mail'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email обязателен' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    // Don't reveal if user exists or not
    if (!user) {
      return NextResponse.json({ success: true })
    }

    await db.verificationCode.deleteMany({ where: { email, type: 'password_reset' } })

    const code = generateCode()
    await db.verificationCode.create({
      data: {
        email,
        code,
        type: 'password_reset',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      }
    })

    await sendMail({
      to: email,
      subject: 'Сброс пароля Messme',
      html: `<p>Код для сброса пароля: <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>Код действителен 15 минут.</p>`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json({ error: 'Ошибка при отправке кода' }, { status: 500 })
  }
}
