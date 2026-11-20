-- Anexos de conversa deixam de expirar em 90 dias: o limite passa a ser a cota por pessoa.
ALTER TABLE "chat_attachments" ALTER COLUMN "expires_at" DROP NOT NULL;

-- Anexos que ainda estão guardados passam a valer sem prazo (a cota controla o espaço).
UPDATE "chat_attachments" SET "expires_at" = NULL WHERE "deleted_at" IS NULL;

CREATE INDEX "chat_attachments_uploader_id_deleted_at_created_at_idx"
  ON "chat_attachments" ("uploader_id", "deleted_at", "created_at");
