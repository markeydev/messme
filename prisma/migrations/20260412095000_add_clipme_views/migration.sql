-- CreateTable
CREATE TABLE "clipme_views" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clipme_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clipme_views_videoId_userId_key" ON "clipme_views"("videoId", "userId");

-- CreateIndex
CREATE INDEX "clipme_views_videoId_idx" ON "clipme_views"("videoId");

-- CreateIndex
CREATE INDEX "clipme_views_userId_idx" ON "clipme_views"("userId");

-- AddForeignKey
ALTER TABLE "clipme_views" ADD CONSTRAINT "clipme_views_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "clipme_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clipme_views" ADD CONSTRAINT "clipme_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
