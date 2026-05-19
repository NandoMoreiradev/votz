-- CreateEnum
CREATE TYPE "FollowerActorType" AS ENUM ('POLITICIAN', 'ENTITY');

-- CreateTable
CREATE TABLE "report_followers" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorType" "FollowerActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_followers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_followers_actorType_actorId_idx" ON "report_followers"("actorType", "actorId");

-- CreateIndex
CREATE UNIQUE INDEX "report_followers_reportId_actorType_actorId_key" ON "report_followers"("reportId", "actorType", "actorId");

-- AddForeignKey
ALTER TABLE "report_followers" ADD CONSTRAINT "report_followers_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
