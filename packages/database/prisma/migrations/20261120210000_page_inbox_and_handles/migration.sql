-- CreateEnum
CREATE TYPE "PageConversationStatus" AS ENUM ('OPEN', 'RESOLVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PageMessageSender" AS ENUM ('CITIZEN', 'STAFF');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrgPermission" ADD VALUE 'READ_MESSAGES';
ALTER TYPE "OrgPermission" ADD VALUE 'REPLY_MESSAGES';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "entities" ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "politicians" ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "page_conversations" (
    "id" TEXT NOT NULL,
    "org_type" "OrgType" NOT NULL,
    "org_id" TEXT NOT NULL,
    "citizen_id" TEXT NOT NULL,
    "status" "PageConversationStatus" NOT NULL DEFAULT 'OPEN',
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sender" "PageMessageSender" NOT NULL DEFAULT 'CITIZEN',
    "staff_unread" INTEGER NOT NULL DEFAULT 0,
    "citizen_unread" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "sender_kind" "PageMessageSender" NOT NULL,
    "body_enc" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_conversation_reads" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "first_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_conversation_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_conversations_org_type_org_id_status_last_message_at_idx" ON "page_conversations"("org_type", "org_id", "status", "last_message_at");

-- CreateIndex
CREATE INDEX "page_conversations_citizen_id_last_message_at_idx" ON "page_conversations"("citizen_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "page_conversations_org_type_org_id_citizen_id_key" ON "page_conversations"("org_type", "org_id", "citizen_id");

-- CreateIndex
CREATE INDEX "page_messages_conversation_id_created_at_idx" ON "page_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "page_conversation_reads_conversation_id_user_id_key" ON "page_conversation_reads"("conversation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_username_key" ON "companies"("username");

-- CreateIndex
CREATE UNIQUE INDEX "entities_username_key" ON "entities"("username");

-- CreateIndex
CREATE UNIQUE INDEX "politicians_username_key" ON "politicians"("username");

-- AddForeignKey
ALTER TABLE "page_conversations" ADD CONSTRAINT "page_conversations_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_messages" ADD CONSTRAINT "page_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "page_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_messages" ADD CONSTRAINT "page_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_conversation_reads" ADD CONSTRAINT "page_conversation_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "page_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_conversation_reads" ADD CONSTRAINT "page_conversation_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

