-- Drop E2E per-recipient encryptions table
DROP TABLE IF EXISTS "message_encryptions";

-- Drop multi-device public key table
DROP TABLE IF EXISTS "user_device_keys";

-- Drop E2E columns from users
ALTER TABLE "users" DROP COLUMN IF EXISTS "publicKey";
ALTER TABLE "users" DROP COLUMN IF EXISTS "keyBackup";

-- Drop E2E column from messages
ALTER TABLE "messages" DROP COLUMN IF EXISTS "senderPublicKey";
