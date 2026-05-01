-- AlterTable
ALTER TABLE "chats" ADD COLUMN "pinnedMessageId" TEXT;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_pinnedMessageId_fkey" FOREIGN KEY ("pinnedMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "chats_pinnedMessageId_idx" ON "chats"("pinnedMessageId");
