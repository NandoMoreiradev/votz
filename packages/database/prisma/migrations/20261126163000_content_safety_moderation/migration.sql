-- Enum de origem da sinalização (usuário vs triagem automática por IA)
DO $$ BEGIN
  CREATE TYPE "FlagSource" AS ENUM ('USER', 'AUTO_AI');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enum de visibilidade de moderação (quarentena separada do status cívico do relato)
DO $$ BEGIN
  CREATE TYPE "ModerationStatus" AS ENUM ('PUBLISHED', 'UNDER_REVIEW', 'HIDDEN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "content_flags"
  ADD COLUMN IF NOT EXISTS "source" "FlagSource" NOT NULL DEFAULT 'USER';

ALTER TABLE "reports"
  ADD COLUMN IF NOT EXISTS "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'PUBLISHED';

CREATE INDEX IF NOT EXISTS "reports_moderation_status_idx"
  ON "reports" ("moderation_status");
