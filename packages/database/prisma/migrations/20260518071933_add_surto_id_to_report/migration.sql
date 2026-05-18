-- AlterTable
ALTER TABLE "reports" ADD COLUMN "surtoId" TEXT;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_surtoId_fkey" FOREIGN KEY ("surtoId") REFERENCES "surtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
