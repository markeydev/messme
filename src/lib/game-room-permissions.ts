import { db } from '@/lib/db'
import { randomUUID } from 'crypto'

export interface GameRoomPermissions {
  canMoveMembers: boolean
  canChangeAvatar: boolean
  canRenameChannels: boolean
}

export const FULL_GAME_ROOM_PERMISSIONS: GameRoomPermissions = {
  canMoveMembers: true,
  canChangeAvatar: true,
  canRenameChannels: true,
}

export async function ensureDefaultGameRoomRole(chatId: string) {
  const existingDefault = await db.gameRoomRole.findFirst({
    where: { chatId, isDefault: true },
    select: { id: true },
  })
  if (existingDefault) return existingDefault
  return db.gameRoomRole.create({
    data: {
      id: randomUUID(),
      chatId,
      name: 'Участник',
      color: '#8b97ff',
      position: 999,
      isDefault: true,
      canMoveMembers: false,
      canChangeAvatar: false,
      canRenameChannels: false,
    },
    select: { id: true },
  })
}

export async function assignDefaultRole(chatId: string, userId: string) {
  const role = await ensureDefaultGameRoomRole(chatId)
  await db.gameRoomRoleMember.upsert({
    where: {
      roleId_userId: {
        roleId: role.id,
        userId,
      },
    },
    update: {},
    create: {
      id: randomUUID(),
      roleId: role.id,
      userId,
    },
  })
}

export async function getGameRoomPermissions(chatId: string, userId: string): Promise<GameRoomPermissions> {
  const chat = await db.chat.findUnique({
    where: { id: chatId },
    select: { ownerId: true, gameMode: true },
  })

  if (!chat?.gameMode) {
    return {
      canMoveMembers: false,
      canChangeAvatar: false,
      canRenameChannels: false,
    }
  }

  if (chat.ownerId === userId) return FULL_GAME_ROOM_PERMISSIONS

  const roleMemberships = await db.gameRoomRoleMember.findMany({
    where: {
      userId,
      role: {
        chatId,
      },
    },
    select: {
      role: {
        select: {
          canMoveMembers: true,
          canChangeAvatar: true,
          canRenameChannels: true,
        },
      },
    },
  })

  return roleMemberships.reduce<GameRoomPermissions>(
    (acc, item) => ({
      canMoveMembers: acc.canMoveMembers || item.role.canMoveMembers,
      canChangeAvatar: acc.canChangeAvatar || item.role.canChangeAvatar,
      canRenameChannels: acc.canRenameChannels || item.role.canRenameChannels,
    }),
    {
      canMoveMembers: false,
      canChangeAvatar: false,
      canRenameChannels: false,
    }
  )
}
