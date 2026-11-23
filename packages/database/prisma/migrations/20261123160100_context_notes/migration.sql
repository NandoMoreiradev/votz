-- Contexto da Comunidade (docs/dev/contexto-da-comunidade-analise-2026-11-23.md), etapa 1.

CREATE TYPE "ContextNoteKind" AS ENUM ('CORRECTION', 'MISSING_CONTEXT', 'OUT_OF_CONTEXT_MEDIA', 'EXTRA_EVIDENCE', 'UPDATE', 'DUPLICATE');
CREATE TYPE "ContextNoteStatus" AS ENUM ('NEEDS_RATINGS', 'SHOWN', 'NOT_SHOWN', 'REMOVED');
CREATE TYPE "ContextNoteOrigin" AS ENUM ('HUMAN', 'AI');
CREATE TYPE "ContextNoteRatingValue" AS ENUM ('HELPFUL', 'SOMEWHAT', 'NOT_HELPFUL');

CREATE TABLE "context_notes" (
    "id" TEXT NOT NULL,
    "post_id" TEXT,
    "report_id" TEXT,
    "author_id" TEXT,
    "origin" "ContextNoteOrigin" NOT NULL DEFAULT 'HUMAN',
    "kind" "ContextNoteKind" NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "sources" TEXT[],
    "status" "ContextNoteStatus" NOT NULL DEFAULT 'NEEDS_RATINGS',
    "ratings_count" INTEGER NOT NULL DEFAULT 0,
    "helpful_share" DOUBLE PRECISION,
    "bad_streak" INTEGER NOT NULL DEFAULT 0,
    "shown_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "removed_reason" VARCHAR(500),
    "removed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_notes_pkey" PRIMARY KEY ("id"),
    -- A nota é de uma publicação OU de um relato, nunca dos dois nem de nenhum.
    CONSTRAINT "context_notes_one_target" CHECK (("post_id" IS NULL) <> ("report_id" IS NULL))
);

CREATE TABLE "context_note_ratings" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "rater_id" TEXT NOT NULL,
    "value" "ContextNoteRatingValue" NOT NULL,
    "reasons" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_note_ratings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "context_note_requests" (
    "id" TEXT NOT NULL,
    "post_id" TEXT,
    "report_id" TEXT,
    "requester_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_note_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "context_note_requests_one_target" CHECK (("post_id" IS NULL) <> ("report_id" IS NULL))
);

CREATE TABLE "context_contributors" (
    "user_id" TEXT NOT NULL,
    "terms_version" TEXT NOT NULL,
    "terms_accepted_at" TIMESTAMP(3) NOT NULL,
    "ratings_given" INTEGER NOT NULL DEFAULT 0,
    "ratings_resolved" INTEGER NOT NULL DEFAULT 0,
    "ratings_aligned" INTEGER NOT NULL DEFAULT 0,
    "write_granted_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_contributors_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "context_note_status_log" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "from_status" "ContextNoteStatus",
    "to_status" "ContextNoteStatus" NOT NULL,
    "cause" TEXT NOT NULL,
    "actor_id" TEXT,
    "ratings_count" INTEGER NOT NULL DEFAULT 0,
    "helpful_share" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_note_status_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "context_notes_post_id_status_idx" ON "context_notes"("post_id", "status");
CREATE INDEX "context_notes_report_id_status_idx" ON "context_notes"("report_id", "status");
CREATE INDEX "context_notes_status_created_at_idx" ON "context_notes"("status", "created_at");
CREATE INDEX "context_notes_author_id_created_at_idx" ON "context_notes"("author_id", "created_at");
CREATE UNIQUE INDEX "context_note_ratings_note_id_rater_id_key" ON "context_note_ratings"("note_id", "rater_id");
CREATE INDEX "context_note_ratings_rater_id_created_at_idx" ON "context_note_ratings"("rater_id", "created_at");
CREATE UNIQUE INDEX "context_note_requests_requester_id_post_id_key" ON "context_note_requests"("requester_id", "post_id");
CREATE UNIQUE INDEX "context_note_requests_requester_id_report_id_key" ON "context_note_requests"("requester_id", "report_id");
CREATE INDEX "context_note_requests_post_id_idx" ON "context_note_requests"("post_id");
CREATE INDEX "context_note_requests_report_id_idx" ON "context_note_requests"("report_id");
CREATE INDEX "context_note_status_log_note_id_created_at_idx" ON "context_note_status_log"("note_id", "created_at");

ALTER TABLE "context_notes" ADD CONSTRAINT "context_notes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_notes" ADD CONSTRAINT "context_notes_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_notes" ADD CONSTRAINT "context_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "context_note_ratings" ADD CONSTRAINT "context_note_ratings_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "context_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_note_ratings" ADD CONSTRAINT "context_note_ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_note_requests" ADD CONSTRAINT "context_note_requests_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_note_requests" ADD CONSTRAINT "context_note_requests_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_note_requests" ADD CONSTRAINT "context_note_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_contributors" ADD CONSTRAINT "context_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_note_status_log" ADD CONSTRAINT "context_note_status_log_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "context_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
