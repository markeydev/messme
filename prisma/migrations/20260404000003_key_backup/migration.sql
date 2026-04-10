-- Add encrypted key backup column to users table
ALTER TABLE "users" ADD COLUMN "keyBackup" TEXT;
