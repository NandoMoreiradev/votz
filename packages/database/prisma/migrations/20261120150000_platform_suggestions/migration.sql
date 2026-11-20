-- CreateEnum
CREATE TYPE "SuggestionCategory" AS ENUM ('FEATURE', 'IMPROVEMENT', 'BUG', 'UX', 'OTHER');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED');

-- CreateTable
CREATE TABLE "platform_suggestions" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "category" "SuggestionCategory" NOT NULL DEFAULT 'IMPROVEMENT',
    "status" "SuggestionStatus" NOT NULL DEFAULT 'OPEN',
    "admin_note" VARCHAR(1000),
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "votes_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_suggestion_votes" (
    "id" TEXT NOT NULL,
    "suggestion_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_suggestion_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_suggestions_status_votes_count_idx" ON "platform_suggestions"("status", "votes_count");

-- CreateIndex
CREATE INDEX "platform_suggestions_created_at_idx" ON "platform_suggestions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_suggestion_votes_suggestion_id_user_id_key" ON "platform_suggestion_votes"("suggestion_id", "user_id");

-- AddForeignKey
ALTER TABLE "platform_suggestions" ADD CONSTRAINT "platform_suggestions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_suggestion_votes" ADD CONSTRAINT "platform_suggestion_votes_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "platform_suggestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_suggestion_votes" ADD CONSTRAINT "platform_suggestion_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

