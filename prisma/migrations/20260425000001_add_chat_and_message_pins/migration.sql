ALTER TABLE "chat_members"
  ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pinnedAt" TIMESTAMP(3),
  ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "messages"
  ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pinnedAt" TIMESTAMP(3);

CREATE INDEX "chat_members_userId_isPinned_pinnedAt_idx"
  ON "chat_members"("userId", "isPinned", "pinnedAt");

CREATE INDEX "chat_members_userId_isArchived_archivedAt_idx"
  ON "chat_members"("userId", "isArchived", "archivedAt");

CREATE INDEX "messages_chatId_isPinned_pinnedAt_idx"
  ON "messages"("chatId", "isPinned", "pinnedAt");

CREATE TABLE "message_saves" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_saves_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_saves_messageId_userId_key" ON "message_saves"("messageId", "userId");
CREATE INDEX "message_saves_userId_createdAt_idx" ON "message_saves"("userId", "createdAt");
CREATE INDEX "message_saves_messageId_idx" ON "message_saves"("messageId");

ALTER TABLE "message_saves"
  ADD CONSTRAINT "message_saves_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_saves"
  ADD CONSTRAINT "message_saves_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
