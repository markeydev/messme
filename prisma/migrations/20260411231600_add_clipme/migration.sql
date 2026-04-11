-- CreateEnum
CREATE TYPE "ClipMePrivacy" AS ENUM ('PUBLIC', 'FOLLOWERS', 'PRIVATE');

-- CreateTable
CREATE TABLE "clipme_videos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "privacy" "ClipMePrivacy" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clipme_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clipme_likes" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clipme_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clipme_comments" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clipme_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clipme_reposts" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clipme_reposts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clipme_subscriptions" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clipme_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clipme_videos_userId_createdAt_idx" ON "clipme_videos"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "clipme_videos_privacy_createdAt_idx" ON "clipme_videos"("privacy", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "clipme_likes_videoId_userId_key" ON "clipme_likes"("videoId", "userId");

-- CreateIndex
CREATE INDEX "clipme_likes_userId_idx" ON "clipme_likes"("userId");

-- CreateIndex
CREATE INDEX "clipme_comments_videoId_createdAt_idx" ON "clipme_comments"("videoId", "createdAt");

-- CreateIndex
CREATE INDEX "clipme_comments_userId_createdAt_idx" ON "clipme_comments"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "clipme_reposts_videoId_userId_key" ON "clipme_reposts"("videoId", "userId");

-- CreateIndex
CREATE INDEX "clipme_reposts_userId_idx" ON "clipme_reposts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clipme_subscriptions_followerId_followingId_key" ON "clipme_subscriptions"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "clipme_subscriptions_followingId_idx" ON "clipme_subscriptions"("followingId");

-- AddForeignKey
ALTER TABLE "clipme_videos" ADD CONSTRAINT "clipme_videos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipme_likes" ADD CONSTRAINT "clipme_likes_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "clipme_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipme_likes" ADD CONSTRAINT "clipme_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipme_comments" ADD CONSTRAINT "clipme_comments_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "clipme_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipme_comments" ADD CONSTRAINT "clipme_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipme_reposts" ADD CONSTRAINT "clipme_reposts_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "clipme_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipme_reposts" ADD CONSTRAINT "clipme_reposts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipme_subscriptions" ADD CONSTRAINT "clipme_subscriptions_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipme_subscriptions" ADD CONSTRAINT "clipme_subscriptions_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
