-- CreateTable
CREATE TABLE "message_comments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_comments_messageId_createdAt_idx" ON "message_comments"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "message_comments_userId_idx" ON "message_comments"("userId");

-- AddForeignKey
ALTER TABLE "message_comments" ADD CONSTRAINT "message_comments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_comments" ADD CONSTRAINT "message_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
