-- AlterTable
ALTER TABLE "chat_devices" ADD COLUMN "push_token" VARCHAR(255),
ADD COLUMN "push_token_updated_at" TIMESTAMP(3);
