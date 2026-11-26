-- CreateEnum
CREATE TYPE "SurveyKind" AS ENUM ('VOTING_INTENTION', 'APPROVAL_RATING', 'CIVIC_TOPIC');

-- CreateEnum
CREATE TYPE "SurveyOrigin" AS ENUM ('VOTZ', 'PARTNER_INSTITUTE', 'PUBLIC_ENTITY');

-- CreateEnum
CREATE TYPE "SurveyDistributionMode" AS ENUM ('OPEN', 'INVITED_SAMPLE');

-- CreateEnum
CREATE TYPE "SurveyMethodologyType" AS ENUM ('OPEN_PANEL', 'WEIGHTED_QUOTA', 'REGISTERED_TSE');

-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SurveyScope" AS ENUM ('NATIONAL', 'STATE', 'MUNICIPAL');

-- CreateEnum
CREATE TYPE "SurveyVerificationLevel" AS ENUM ('STANDARD', 'VERIFIED_CPF');

-- CreateEnum
CREATE TYPE "SurveyQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SCALE_5');

-- CreateEnum
CREATE TYPE "SurveyResultsVisibility" AS ENUM ('AFTER_VOTE', 'AFTER_CLOSE');

-- CreateTable
CREATE TABLE "official_surveys" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "subtitle" VARCHAR(320),
    "description" TEXT NOT NULL,
    "kind" "SurveyKind" NOT NULL,
    "origin" "SurveyOrigin" NOT NULL DEFAULT 'VOTZ',
    "distribution_mode" "SurveyDistributionMode" NOT NULL DEFAULT 'OPEN',
    "methodology_type" "SurveyMethodologyType" NOT NULL DEFAULT 'OPEN_PANEL',
    "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" "SurveyScope" NOT NULL DEFAULT 'NATIONAL',
    "target_state" VARCHAR(2),
    "target_city" VARCHAR(120),
    "target_ibge_code" VARCHAR(10),
    "sponsor_entity_id" TEXT,
    "partner_name" VARCHAR(160),
    "partner_logo_url" VARCHAR(500),
    "contractor_name" VARCHAR(160),
    "margin_of_error" DOUBLE PRECISION,
    "confidence_level" INTEGER,
    "verification_level" "SurveyVerificationLevel" NOT NULL DEFAULT 'STANDARD',
    "min_account_age_days" INTEGER NOT NULL DEFAULT 7,
    "results_visibility" "SurveyResultsVisibility" NOT NULL DEFAULT 'AFTER_CLOSE',
    "min_quorum_to_publish" INTEGER NOT NULL DEFAULT 100,
    "k_anonymity_threshold" INTEGER NOT NULL DEFAULT 30,
    "featured_in_feed" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "nullifier_salt_enc" TEXT,
    "salt_destroyed_at" TIMESTAMP(3),
    "is_electoral" BOOLEAN NOT NULL DEFAULT false,
    "tse_registration_code" VARCHAR(60),
    "statistician_name" VARCHAR(140),
    "statistician_conre" VARCHAR(40),
    "methodology_note" TEXT NOT NULL,
    "disclaimer_text" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "published_by_id" TEXT,
    "cancel_reason" TEXT,
    "total_ballots" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_survey_questions" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" VARCHAR(300) NOT NULL,
    "help_text" VARCHAR(300),
    "type" "SurveyQuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "max_selections" INTEGER NOT NULL DEFAULT 1,
    "randomize_options" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "official_survey_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_survey_options" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "subtitle" VARCHAR(160),
    "image_url" VARCHAR(500),
    "politician_id" TEXT,
    "is_pinned_bottom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "official_survey_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_survey_participations" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "nullifier_hash" VARCHAR(64) NOT NULL,
    "participated_bucket" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_survey_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_survey_pending_ballots" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "payload_enc" TEXT NOT NULL,
    "queued_bucket" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_survey_pending_ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_survey_ballots" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "answers_json" JSONB NOT NULL,
    "age_band" VARCHAR(16),
    "gender" VARCHAR(24),
    "state" VARCHAR(2),
    "ibge_code" VARCHAR(10),
    "submitted_bucket" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_survey_ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_survey_aggregates" (
    "id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "segment_key" VARCHAR(64) NOT NULL,
    "votes_count" INTEGER NOT NULL DEFAULT 0,
    "segment_total" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_survey_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "official_surveys_slug_key" ON "official_surveys"("slug");

-- CreateIndex
CREATE INDEX "official_surveys_status_featured_in_feed_starts_at_idx" ON "official_surveys"("status", "featured_in_feed", "starts_at");

-- CreateIndex
CREATE INDEX "official_surveys_scope_target_state_target_ibge_code_status_idx" ON "official_surveys"("scope", "target_state", "target_ibge_code", "status");

-- CreateIndex
CREATE UNIQUE INDEX "official_survey_questions_survey_id_position_key" ON "official_survey_questions"("survey_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "official_survey_options_question_id_position_key" ON "official_survey_options"("question_id", "position");

-- CreateIndex
CREATE INDEX "official_survey_participations_survey_id_idx" ON "official_survey_participations"("survey_id");

-- CreateIndex
CREATE UNIQUE INDEX "official_survey_participations_survey_id_nullifier_hash_key" ON "official_survey_participations"("survey_id", "nullifier_hash");

-- CreateIndex
CREATE INDEX "official_survey_pending_ballots_survey_id_idx" ON "official_survey_pending_ballots"("survey_id");

-- CreateIndex
CREATE INDEX "official_survey_ballots_survey_id_submitted_bucket_idx" ON "official_survey_ballots"("survey_id", "submitted_bucket");

-- CreateIndex
CREATE INDEX "official_survey_ballots_survey_id_state_idx" ON "official_survey_ballots"("survey_id", "state");

-- CreateIndex
CREATE INDEX "official_survey_aggregates_survey_id_segment_key_idx" ON "official_survey_aggregates"("survey_id", "segment_key");

-- CreateIndex
CREATE UNIQUE INDEX "official_survey_aggregates_survey_id_question_id_option_id__key" ON "official_survey_aggregates"("survey_id", "question_id", "option_id", "segment_key");

-- AddForeignKey
ALTER TABLE "official_survey_questions" ADD CONSTRAINT "official_survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "official_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_survey_options" ADD CONSTRAINT "official_survey_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "official_survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_survey_participations" ADD CONSTRAINT "official_survey_participations_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "official_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_survey_pending_ballots" ADD CONSTRAINT "official_survey_pending_ballots_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "official_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_survey_ballots" ADD CONSTRAINT "official_survey_ballots_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "official_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_survey_aggregates" ADD CONSTRAINT "official_survey_aggregates_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "official_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
