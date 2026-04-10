import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        publicKey: true
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Пользователь не найден' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        publicKey: user.publicKey
      }
    })
  } catch (error) {
    console.error('Get public key error:', error)
    return NextResponse.json(
      { error: 'Ошибка при получении ключа' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    const { publicKey } = await request.json()

    if (!publicKey || typeof publicKey !== 'string') {
      return NextResponse.json({ error: 'Публичный ключ обязателен' }, { status: 400 })
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { publicKey },
      select: { id: true, publicKey: true }
    })

    return NextResponse.json({ user: updated })
  } catch (error) {
    console.error('Update public key error:', error)
    return NextResponse.json(
      { error: 'Ошибка при обновлении ключа' },
      { status: 500 }
    )
  }
}
