-- CreateEnum
CREATE TYPE "SurveyReviewStatus" AS ENUM ('APPROVED', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SurveyInvitationStatus" AS ENUM ('INVITED', 'RESPONDED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "research_institutes" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "cnpj" VARCHAR(18),
    "logo_url" VARCHAR(500),
    "website" VARCHAR(300),
    "description" TEXT,
    "statistician_lead" VARCHAR(140),
    "conre_lead" VARCHAR(40),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_institutes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "official_surveys"
    ADD COLUMN "review_status" "SurveyReviewStatus" NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN "review_note" TEXT,
    ADD COLUMN "submitted_by_user_id" TEXT,
    ADD COLUMN "topic_key" VARCHAR(120),
    ADD COLUMN "cooldown_days" INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN "target_sample_size" INTEGER,
    ADD COLUMN "institute_id" TEXT;

-- CreateTable
CREATE TABLE "official_survey_invitations" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "topic_key" VARCHAR(120),
    "status" "SurveyInvitationStatus" NOT NULL DEFAULT 'INVITED',
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "responded_bucket" TIMESTAMP(3),

    CONSTRAINT "official_survey_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "research_institutes_slug_key" ON "research_institutes"("slug");
CREATE UNIQUE INDEX "research_institutes_cnpj_key" ON "research_institutes"("cnpj");
CREATE INDEX "official_surveys_topic_key_status_idx" ON "official_surveys"("topic_key", "status");
CREATE INDEX "official_surveys_sponsor_entity_id_status_idx" ON "official_surveys"("sponsor_entity_id", "status");
CREATE INDEX "official_surveys_review_status_status_idx" ON "official_surveys"("review_status", "status");
CREATE UNIQUE INDEX "official_survey_invitations_survey_id_user_id_key" ON "official_survey_invitations"("survey_id", "user_id");
CREATE INDEX "official_survey_invitations_user_id_status_idx" ON "official_survey_invitations"("user_id", "status");
CREATE INDEX "official_survey_invitations_user_id_topic_key_invited_at_idx" ON "official_survey_invitations"("user_id", "topic_key", "invited_at");

-- AddForeignKey
ALTER TABLE "official_surveys" ADD CONSTRAINT "official_surveys_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "research_institutes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "official_survey_invitations" ADD CONSTRAINT "official_survey_invitations_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "official_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
