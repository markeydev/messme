import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { sendMail, generateCode } from '@/lib/mail'
import { hasAdminAccess } from '@/lib/admin'

// Simple hash function (must match register)
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
    const { login, password } = body

    // Validation
    if (!login || !password) {
      return NextResponse.json(
        { error: 'Введите имя пользователя/email и пароль' },
        { status: 400 }
      )
    }

    // Find user by username or email
    const user = await db.user.findFirst({
      where: {
        OR: [
          { username: login },
          { email: login }
        ]
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Пользователь не найден' },
        { status: 401 }
      )
    }

    if (user.isBlocked) {
      return NextResponse.json(
        { error: 'Ваш аккаунт заблокирован' },
        { status: 403 }
      )
    }

    // Verify password
    const passwordHash = await hashPassword(password)
    if (passwordHash !== user.passwordHash) {
      return NextResponse.json(
        { error: 'Неверный пароль' },
        { status: 401 }
      )
    }

    // If user not verified — resend code
    if (!user.isVerified) {
      await db.verificationCode.deleteMany({ where: { email: user.email, type: 'email_verify' } })
      const code = generateCode()
      await db.verificationCode.create({
        data: {
          email: user.email,
          code,
          type: 'email_verify',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        }
      })
      await sendMail({
        to: user.email,
        subject: 'Код подтверждения Messme',
        html: `<p>Ваш код подтверждения: <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>Код действителен 15 минут.</p>`,
      })
      return NextResponse.json({ needsVerification: true, email: user.email })
    }

    // Create session token
    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await db.session.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        token,
        expiresAt
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
      token
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Ошибка при входе' },
      { status: 500 }
    )
  }
}
