-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "forwardedFromUsername" TEXT,
ADD COLUMN     "isForwarded" BOOLEAN NOT NULL DEFAULT false;
