-- Habilita extensão de similaridade por trigramas (usada em ReportsRepository.findByTrigram)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Coluna gerada de busca textual em português (título com peso A, descrição com peso B)
ALTER TABLE "reports"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce("description", '')), 'B')
  ) STORED;

-- Índices para busca híbrida de relatos similares (full-text, trigram e pgvector cosine)
CREATE INDEX IF NOT EXISTS "reports_search_vector_gin_idx"
  ON "reports" USING GIN ("search_vector");

CREATE INDEX IF NOT EXISTS "reports_title_trgm_gin_idx"
  ON "reports" USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "reports_description_trgm_gin_idx"
  ON "reports" USING GIN ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "reports_embedding_hnsw_idx"
  ON "reports" USING hnsw ("embedding" vector_cosine_ops);
