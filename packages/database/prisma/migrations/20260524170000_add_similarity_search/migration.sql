-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding column (populated async via BullMQ after report creation)
ALTER TABLE "reports" ADD COLUMN "embedding" vector(768);

-- Auto-generated full-text search vector (always in sync with title/description)
ALTER TABLE "reports" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(description, '')), 'B')
  ) STORED;

-- HNSW index for fast cosine similarity (pgvector)
CREATE INDEX "reports_embedding_hnsw_idx" ON "reports" USING hnsw ("embedding" vector_cosine_ops);

-- GIN index for full-text search
CREATE INDEX "reports_search_vector_gin_idx" ON "reports" USING gin ("search_vector");

-- GIN trigram indexes for fuzzy matching
CREATE INDEX "reports_title_trgm_idx" ON "reports" USING gin ("title" gin_trgm_ops);
CREATE INDEX "reports_description_trgm_idx" ON "reports" USING gin ("description" gin_trgm_ops);
