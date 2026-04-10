-- CreateTable
CREATE TABLE "message_encryptions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    CONSTRAINT "message_encryptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_encryptions_messageId_recipientId_key" ON "message_encryptions"("messageId", "recipientId");

-- AddForeignKey
ALTER TABLE "message_encryptions" ADD CONSTRAINT "message_encryptions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
