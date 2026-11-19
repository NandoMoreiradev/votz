-- CreateTable
CREATE TABLE "chat_attachments" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_attachments_object_key_key" ON "chat_attachments"("object_key");

-- CreateIndex
CREATE INDEX "chat_attachments_conversation_id_created_at_idx" ON "chat_attachments"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_attachments_expires_at_deleted_at_idx" ON "chat_attachments"("expires_at", "deleted_at");

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
