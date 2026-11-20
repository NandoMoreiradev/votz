-- Cada arquivo enviado para relato, para saber o que foi anexado e limpar o que ficou sem uso.
CREATE TABLE "report_media" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "has_thumb" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attached_at" TIMESTAMP(3),

    CONSTRAINT "report_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_media_key_key" ON "report_media"("key");

CREATE INDEX "report_media_attached_at_created_at_idx" ON "report_media"("attached_at", "created_at");

CREATE INDEX "report_media_uploader_id_created_at_idx" ON "report_media"("uploader_id", "created_at");
