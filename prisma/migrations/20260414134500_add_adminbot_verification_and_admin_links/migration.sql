-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "isBadgeVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isBlocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "admin_panel_link_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "admin_panel_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_panel_link_tokens_token_key" ON "admin_panel_link_tokens"("token");

-- CreateIndex
CREATE INDEX "admin_panel_link_tokens_userId_expiresAt_idx" ON "admin_panel_link_tokens"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "admin_panel_link_tokens"
  ADD CONSTRAINT "admin_panel_link_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
