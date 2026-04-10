-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'VIDEO_NOTE';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "videoNoteDuration" INTEGER,
ADD COLUMN     "videoNoteUrl" TEXT;
