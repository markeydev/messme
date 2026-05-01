-- Drop old single pinnedMessageId from chats
ALTER TABLE "chats" DROP CONSTRAINT IF EXISTS "chats_pinnedMessageId_fkey";
DROP INDEX IF EXISTS "chats_pinnedMessageId_idx";
ALTER TABLE "chats" DROP COLUMN IF EXISTS "pinnedMessageId";

-- Create pinned_chat_messages table
CREATE TABLE "pinned_chat_messages" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pinned_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pinned_chat_messages_chatId_messageId_key" ON "pinned_chat_messages"("chatId", "messageId");
CREATE INDEX "pinned_chat_messages_chatId_pinnedAt_idx" ON "pinned_chat_messages"("chatId", "pinnedAt");

ALTER TABLE "pinned_chat_messages" ADD CONSTRAINT "pinned_chat_messages_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pinned_chat_messages" ADD CONSTRAINT "pinned_chat_messages_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pinned_chat_messages" ADD CONSTRAINT "pinned_chat_messages_pinnedById_fkey"
    FOREIGN KEY ("pinnedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
