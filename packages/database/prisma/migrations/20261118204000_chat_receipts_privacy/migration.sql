CREATE TABLE "chat_privacy" (
  "user_id" TEXT NOT NULL,
  "read_receipts_enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chat_privacy_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "chat_privacy_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "chat_receipts" (
  "conversation_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "recipient_user_id" TEXT NOT NULL,
  "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMP(3),
  CONSTRAINT "chat_receipts_pkey" PRIMARY KEY ("conversation_id", "event_id", "recipient_user_id"),
  CONSTRAINT "chat_receipts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_receipts_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "chat_receipts_conversation_id_recipient_user_id_idx" ON "chat_receipts"("conversation_id", "recipient_user_id");
