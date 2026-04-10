-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'AUDIO');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "audioDuration" INTEGER,
ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'TEXT';
