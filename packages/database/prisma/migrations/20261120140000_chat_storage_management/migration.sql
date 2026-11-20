-- Tipo grosso do anexo (IMAGE, VIDEO, AUDIO, FILE), só para a tela "Gerenciar armazenamento".
ALTER TABLE "chat_attachments" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FILE';

-- Espaço de mídia liberado por pessoa. Sem linha = cota padrão.
CREATE TABLE "chat_storage" (
    "user_id" TEXT NOT NULL,
    "quota_mb" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_storage_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "chat_storage"
  ADD CONSTRAINT "chat_storage_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
