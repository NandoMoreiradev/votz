-- CreateTable
CREATE TABLE "ad_landing_checks" (
    "id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "http_status" INTEGER,
    "final_host" TEXT,
    "redirects" INTEGER NOT NULL DEFAULT 0,
    "problems" TEXT[],
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_landing_checks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ad_landing_checks_status_valid" CHECK ("status" IN ('OK', 'BAD_STATUS', 'UNREACHABLE', 'BLOCKED')),
    CONSTRAINT "ad_landing_checks_trigger_valid" CHECK ("trigger" IN ('SUBMIT', 'WEEKLY', 'RETRY'))
);

-- CreateIndex
CREATE INDEX "ad_landing_checks_ad_id_checked_at_idx" ON "ad_landing_checks"("ad_id", "checked_at");

-- AddForeignKey
ALTER TABLE "ad_landing_checks" ADD CONSTRAINT "ad_landing_checks_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
