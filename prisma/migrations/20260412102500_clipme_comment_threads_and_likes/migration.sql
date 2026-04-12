-- AlterTable
ALTER TABLE "clipme_comments"
ADD COLUMN "parentId" TEXT;

-- CreateTable
CREATE TABLE "clipme_comment_likes" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clipme_comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clipme_comments_videoId_parentId_createdAt_idx" ON "clipme_comments"("videoId", "parentId", "createdAt");

-- CreateIndex
CREATE INDEX "clipme_comments_parentId_idx" ON "clipme_comments"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "clipme_comment_likes_commentId_userId_key" ON "clipme_comment_likes"("commentId", "userId");

-- CreateIndex
CREATE INDEX "clipme_comment_likes_userId_idx" ON "clipme_comment_likes"("userId");

-- CreateIndex
CREATE INDEX "clipme_comment_likes_commentId_idx" ON "clipme_comment_likes"("commentId");

-- AddForeignKey
ALTER TABLE "clipme_comments" ADD CONSTRAINT "clipme_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "clipme_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipme_comment_likes" ADD CONSTRAINT "clipme_comment_likes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "clipme_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipme_comment_likes" ADD CONSTRAINT "clipme_comment_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
