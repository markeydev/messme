-- CreateTable
CREATE TABLE "message_views" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_views_messageId_viewerId_key" ON "message_views"("messageId", "viewerId");

-- CreateIndex
CREATE INDEX "message_views_messageId_idx" ON "message_views"("messageId");

-- AddForeignKey
ALTER TABLE "message_views" ADD CONSTRAINT "message_views_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_views" ADD CONSTRAINT "message_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
