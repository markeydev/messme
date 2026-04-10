-- Add senderPublicKey to messages (immutable, set at send time)
ALTER TABLE "messages" ADD COLUMN "senderPublicKey" TEXT;

-- Add deviceId to message_encryptions ('' = legacy / no device tracking)
ALTER TABLE "message_encryptions" ADD COLUMN "deviceId" TEXT NOT NULL DEFAULT '';

-- Replace old unique index with composite one
DROP INDEX "message_encryptions_messageId_recipientId_key";
CREATE UNIQUE INDEX "message_encryptions_messageId_recipientId_deviceId_key"
  ON "message_encryptions"("messageId", "recipientId", "deviceId");

-- Create user_device_keys table (one row per user × device)
CREATE TABLE "user_device_keys" (
    "id"        TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "deviceId"  TEXT         NOT NULL,
    "publicKey" TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_device_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_device_keys_userId_deviceId_key"
  ON "user_device_keys"("userId", "deviceId");

CREATE INDEX "user_device_keys_userId_idx"
  ON "user_device_keys"("userId");

ALTER TABLE "user_device_keys"
  ADD CONSTRAINT "user_device_keys_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
