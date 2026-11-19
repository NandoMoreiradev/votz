-- Prévia de lista: horário e autoria da última mensagem e contador de não lidas.
-- Somente metadados; o conteúdo das mensagens continua cifrado e desconhecido do servidor.
ALTER TABLE "conversations"
  ADD COLUMN "last_event_id" TEXT,
  ADD COLUMN "last_event_at" TIMESTAMP(3),
  ADD COLUMN "last_sender_id" TEXT;
ALTER TABLE "conversation_members"
  ADD COLUMN "unread_count" INTEGER NOT NULL DEFAULT 0;
