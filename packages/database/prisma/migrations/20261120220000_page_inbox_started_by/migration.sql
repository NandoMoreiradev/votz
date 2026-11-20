-- AlterTable
ALTER TABLE "page_conversations" ADD COLUMN     "citizen_accepted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "started_by" "PageMessageSender" NOT NULL DEFAULT 'CITIZEN';

