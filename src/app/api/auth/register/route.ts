import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { sendMail, generateCode } from '@/lib/mail'

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + 'messenger-salt-2024')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, email, password } = body

    if (!username || !email || !password) {
      return NextResponse.json({ error: 'Все поля обязательны для заполнения' }, { status: 400 })
    }
    if (username.length < 3) {
      return NextResponse.json({ error: 'Имя пользователя должно содержать минимум 3 символа' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Пароль должен содержать минимум 6 символов' }, { status: 400 })
    }

    const existingUser = await db.user.findFirst({
      where: { OR: [{ username }, { email }] }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Пользователь с таким именем или email уже существует' },
        { status: 400 }
      )
    }

    const passwordHash = await hashPassword(password)

    await db.user.create({
      data: { id: randomUUID(), username, email, passwordHash, isVerified: false }
    })

    // Delete old codes for this email
    await db.verificationCode.deleteMany({ where: { email, type: 'email_verify' } })

    const code = generateCode()
    await db.verificationCode.create({
      data: {
        email,
        code,
        type: 'email_verify',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
      }
    })

    await sendMail({
      to: email,
      subject: 'Код подтверждения Messme',
      html: `<p>Ваш код подтверждения: <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>Код действителен 15 минут.</p>`,
    })

    return NextResponse.json({ needsVerification: true, email })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Ошибка при регистрации' }, { status: 500 })
  }
}
