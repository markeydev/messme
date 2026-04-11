-- CreateTable
CREATE TABLE "game_room_roles" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8b97ff',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "canMoveMembers" BOOLEAN NOT NULL DEFAULT false,
    "canChangeAvatar" BOOLEAN NOT NULL DEFAULT false,
    "canRenameChannels" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_room_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_room_role_members" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_room_role_members_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "channel_messages" ADD COLUMN "replyToId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "game_room_roles_chatId_name_key" ON "game_room_roles"("chatId", "name");
CREATE INDEX "game_room_roles_chatId_position_idx" ON "game_room_roles"("chatId", "position");
CREATE UNIQUE INDEX "game_room_role_members_roleId_userId_key" ON "game_room_role_members"("roleId", "userId");
CREATE INDEX "game_room_role_members_userId_idx" ON "game_room_role_members"("userId");
CREATE INDEX "channel_messages_replyToId_idx" ON "channel_messages"("replyToId");
CREATE UNIQUE INDEX "game_room_roles_chatId_default_unique" ON "game_room_roles"("chatId") WHERE "isDefault" = true;

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "channel_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "game_room_roles" ADD CONSTRAINT "game_room_roles_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_room_role_members" ADD CONSTRAINT "game_room_role_members_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "game_room_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_room_role_members" ADD CONSTRAINT "game_room_role_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
