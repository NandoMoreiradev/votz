-- CreateTable
CREATE TABLE "ad_ai_analyses" (
    "id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "category" TEXT,
    "restricted" TEXT,
    "violations" JSONB NOT NULL,
    "sensitive" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "auto_approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_ai_analyses_ad_id_created_at_idx" ON "ad_ai_analyses"("ad_id", "created_at");

-- AddForeignKey
ALTER TABLE "ad_ai_analyses" ADD CONSTRAINT "ad_ai_analyses_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
