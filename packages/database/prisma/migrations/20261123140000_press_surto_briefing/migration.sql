-- Imprensa, fase 3: briefing de surto escrito por IA (um por surto, refeito depois de algumas horas).

CREATE TABLE "press_surto_briefings" (
    "id" TEXT NOT NULL,
    "surto_id" TEXT NOT NULL,
    "ai_generated" BOOLEAN NOT NULL,
    "model" VARCHAR(80),
    "content" JSONB,
    "stats" JSONB NOT NULL,
    "references" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "press_surto_briefings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "press_surto_briefings_surto_id_generated_at_idx" ON "press_surto_briefings"("surto_id", "generated_at");

ALTER TABLE "press_surto_briefings" ADD CONSTRAINT "press_surto_briefings_surto_id_fkey" FOREIGN KEY ("surto_id") REFERENCES "surtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
