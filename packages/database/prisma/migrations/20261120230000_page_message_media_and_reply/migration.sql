-- AlterTable
ALTER TABLE "page_messages" ADD COLUMN     "reply_to_id" TEXT;

-- CreateTable
CREATE TABLE "page_attachments" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "name_enc" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "thumbnail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "page_attachments_message_id_key" ON "page_attachments"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "page_attachments_object_key_key" ON "page_attachments"("object_key");

-- CreateIndex
CREATE INDEX "page_attachments_conversation_id_created_at_idx" ON "page_attachments"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "page_messages" ADD CONSTRAINT "page_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "page_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_attachments" ADD CONSTRAINT "page_attachments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "page_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_attachments" ADD CONSTRAINT "page_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "page_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
