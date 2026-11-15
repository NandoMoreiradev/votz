-- Brief 4B: Camada de agregacao, geolocalizacao geohash-7 e timestamps de resposta/resolucao

-- 1. Colunas normalizadas e metricas de atendimento em reports
ALTER TABLE "reports"
  ADD COLUMN "city_key" TEXT,
  ADD COLUMN "neighborhood_key" TEXT,
  ADD COLUMN "cell7" TEXT,
  ADD COLUMN "first_response_at" TIMESTAMP(3),
  ADD COLUMN "resolved_at" TIMESTAMP(3);

CREATE INDEX "reports_state_city_key_createdAt_idx" ON "reports"("state", "city_key", "createdAt");
CREATE INDEX "reports_cell7_category_createdAt_idx" ON "reports"("cell7", "category", "createdAt");
CREATE INDEX "reports_recipientType_recipientId_createdAt_idx" ON "reports"("recipientType", "recipientId", "createdAt");
CREATE INDEX "reports_updatedAt_idx" ON "reports"("updatedAt");

-- 2. Backfill de city_key e neighborhood_key normalizados
UPDATE "reports"
SET
  "city_key" = CASE
    WHEN "city" IS NULL OR btrim("city") = '' THEN NULL
    ELSE btrim(regexp_replace(
      translate(
        lower("city"),
        'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+', ' ', 'g'
    ))
  END,
  "neighborhood_key" = CASE
    WHEN "neighborhood" IS NULL OR btrim("neighborhood") = '' THEN NULL
    ELSE btrim(regexp_replace(
      translate(
        lower("neighborhood"),
        'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+', ' ', 'g'
    ))
  END;

-- 3. Backfill de cell7 (Geohash precisao 7) para relatos com coordenadas validas
DO $$
DECLARE
  base32 CONSTANT TEXT := '0123456789bcdefghjkmnpqrstuvwxyz';
  rec RECORD;
  lat_min DOUBLE PRECISION;
  lat_max DOUBLE PRECISION;
  lng_min DOUBLE PRECISION;
  lng_max DOUBLE PRECISION;
  mid DOUBLE PRECISION;
  is_lng BOOLEAN;
  bit_idx INT;
  ch INT;
  gh TEXT;
BEGIN
  FOR rec IN
    SELECT id, latitude, longitude
    FROM "reports"
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND latitude BETWEEN -90 AND 90
      AND longitude BETWEEN -180 AND 180
  LOOP
    lat_min := -90.0;
    lat_max := 90.0;
    lng_min := -180.0;
    lng_max := 180.0;
    is_lng := TRUE;
    bit_idx := 0;
    ch := 0;
    gh := '';

    WHILE char_length(gh) < 7 LOOP
      IF is_lng THEN
        mid := (lng_min + lng_max) / 2.0;
        IF rec.longitude >= mid THEN
          ch := (ch << 1) | 1;
          lng_min := mid;
        ELSE
          ch := (ch << 1);
          lng_max := mid;
        END IF;
      ELSE
        mid := (lat_min + lat_max) / 2.0;
        IF rec.latitude >= mid THEN
          ch := (ch << 1) | 1;
          lat_min := mid;
        ELSE
          ch := (ch << 1);
          lat_max := mid;
        END IF;
      END IF;

      is_lng := NOT is_lng;
      bit_idx := bit_idx + 1;

      IF bit_idx = 5 THEN
        gh := gh || substr(base32, ch + 1, 1);
        bit_idx := 0;
        ch := 0;
      END IF;
    END LOOP;

    UPDATE "reports" SET "cell7" = gh WHERE id = rec.id;
  END LOOP;
END $$;

-- 4. Backfill de first_response_at e resolved_at a partir de timeline_events
UPDATE "reports" r
SET "first_response_at" = sub.first_resp
FROM (
  SELECT te."reportId", MIN(te."createdAt") AS first_resp
  FROM "timeline_events" te
  INNER JOIN "reports" rep ON rep.id = te."reportId"
  WHERE te."type" IN ('RESPONDED', 'STATUS_CHANGED', 'RESOLVED', 'UPDATE')
    AND COALESCE(te."metadata"->>'action', '') <> 'recipient_updated'
    AND (rep."authorId" IS NULL OR te."authorId" IS DISTINCT FROM rep."authorId" OR te."type" IN ('RESPONDED', 'STATUS_CHANGED', 'RESOLVED'))
  GROUP BY te."reportId"
) sub
WHERE r.id = sub."reportId"
  AND r."first_response_at" IS NULL;

UPDATE "reports" r
SET "resolved_at" = sub.first_resolved
FROM (
  SELECT te."reportId", MIN(te."createdAt") AS first_resolved
  FROM "timeline_events" te
  WHERE te."type" = 'RESOLVED'
     OR (te."type" = 'STATUS_CHANGED' AND te."metadata"->>'newStatus' = 'RESOLVED')
  GROUP BY te."reportId"
) sub
WHERE r.id = sub."reportId"
  AND r."resolved_at" IS NULL;

UPDATE "reports"
SET "resolved_at" = "updatedAt"
WHERE "status" = 'RESOLVED'
  AND "resolved_at" IS NULL;

-- 5. Tabelas de rollup pre-calculadas
CREATE TABLE "area_metrics_daily" (
  "id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "state" TEXT NOT NULL,
  "city_key" TEXT NOT NULL,
  "city_display" TEXT NOT NULL DEFAULT '',
  "cell7" TEXT,
  "category" "Category" NOT NULL,
  "created_count" INTEGER NOT NULL DEFAULT 0,
  "resolved_count" INTEGER NOT NULL DEFAULT 0,
  "open_current_count" INTEGER NOT NULL DEFAULT 0,
  "contested_count" INTEGER NOT NULL DEFAULT 0,
  "response_count" INTEGER NOT NULL DEFAULT 0,
  "resolution_duration_count" INTEGER NOT NULL DEFAULT 0,
  "resp_buckets" INTEGER[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0],
  "res_buckets" INTEGER[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0],
  "pressure_buckets" INTEGER[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0,0],
  "pressure_sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "support_count" INTEGER NOT NULL DEFAULT 0,
  "comment_count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "area_metrics_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "area_metrics_daily_dim_uq"
  ON "area_metrics_daily"("day", "state", "city_key", COALESCE("cell7", ''), "category");
CREATE INDEX "area_metrics_daily_state_city_key_day_idx" ON "area_metrics_daily"("state", "city_key", "day");
CREATE INDEX "area_metrics_daily_state_day_category_idx" ON "area_metrics_daily"("state", "day", "category");
CREATE INDEX "area_metrics_daily_state_city_key_cell7_day_idx" ON "area_metrics_daily"("state", "city_key", "cell7", "day");
CREATE INDEX "area_metrics_daily_day_idx" ON "area_metrics_daily"("day");

CREATE TABLE "recipient_metrics_daily" (
  "id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "recipient_type" "RecipientType" NOT NULL,
  "recipient_id" TEXT NOT NULL,
  "category" "Category" NOT NULL,
  "created_count" INTEGER NOT NULL DEFAULT 0,
  "resolved_count" INTEGER NOT NULL DEFAULT 0,
  "open_current_count" INTEGER NOT NULL DEFAULT 0,
  "contested_count" INTEGER NOT NULL DEFAULT 0,
  "response_count" INTEGER NOT NULL DEFAULT 0,
  "resolution_duration_count" INTEGER NOT NULL DEFAULT 0,
  "resp_buckets" INTEGER[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0],
  "res_buckets" INTEGER[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0],
  "pressure_buckets" INTEGER[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0,0],
  "pressure_sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "support_count" INTEGER NOT NULL DEFAULT 0,
  "comment_count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recipient_metrics_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recipient_metrics_daily_day_recipient_type_recipient_id_cat_key"
  ON "recipient_metrics_daily"("day", "recipient_type", "recipient_id", "category");
CREATE INDEX "recipient_metrics_daily_recipient_type_recipient_id_day_idx"
  ON "recipient_metrics_daily"("recipient_type", "recipient_id", "day");

CREATE TABLE "recurrence_cells" (
  "id" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "city_key" TEXT NOT NULL,
  "cell7" TEXT NOT NULL,
  "category" "Category" NOT NULL,
  "window_end" DATE NOT NULL,
  "count_90d" INTEGER NOT NULL,
  "first_seen" TIMESTAMP(3) NOT NULL,
  "last_seen" TIMESTAMP(3) NOT NULL,
  "avg_gap_days" DOUBLE PRECISION,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "recurrence_cells_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recurrence_cells_cell7_category_window_end_key"
  ON "recurrence_cells"("cell7", "category", "window_end");
CREATE INDEX "recurrence_cells_state_city_key_window_end_count_90d_idx"
  ON "recurrence_cells"("state", "city_key", "window_end", "count_90d");
CREATE INDEX "recurrence_cells_state_window_end_count_90d_idx"
  ON "recurrence_cells"("state", "window_end", "count_90d");
