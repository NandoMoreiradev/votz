-- Multi-dispositivo: uma conta pode ter vários aparelhos de conversas ativos.
-- Um aparelho adicional só é ativado depois de aprovado por um aparelho já ativo.
DROP INDEX IF EXISTS "chat_devices_one_active_per_user";
ALTER TABLE "chat_devices" ADD COLUMN "label" VARCHAR(60);
CREATE TABLE "chat_device_links" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "platform" VARCHAR(20) NOT NULL,
  "label" VARCHAR(60),
  "secret_hash" TEXT NOT NULL,
  "code" VARCHAR(6) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "decided_at" TIMESTAMP(3),
  "approved" BOOLEAN,
  "decided_by_device_id" TEXT,
  CONSTRAINT "chat_device_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_device_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "chat_device_links_user_id_expires_at_idx" ON "chat_device_links"("user_id", "expires_at");
