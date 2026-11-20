-- AlterTable: capa do perfil (opcional) em usuário, político, entidade e empresa
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;
ALTER TABLE "politicians" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;
ALTER TABLE "entities" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;

-- CreateTable: seguidores de empresa
CREATE TABLE IF NOT EXISTS "user_company_followers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_company_followers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_company_followers_user_id_company_id_key" ON "user_company_followers"("user_id", "company_id");
CREATE INDEX IF NOT EXISTS "user_company_followers_company_id_idx" ON "user_company_followers"("company_id");

-- AddForeignKey
ALTER TABLE "user_company_followers" ADD CONSTRAINT "user_company_followers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_company_followers" ADD CONSTRAINT "user_company_followers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
