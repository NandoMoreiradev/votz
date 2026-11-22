-- Padrão de fotos e vídeos: docs/dev/padrao-de-midia-plano-2026-11-21.md
-- CreateEnum
CREATE TYPE "MediaAssetPurpose" AS ENUM ('POST', 'AD_CREATIVE');

-- CreateEnum
CREATE TYPE "MediaAssetKind" AS ENUM ('IMAGE', 'VIDEO', 'GIF');

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaFormat" AS ENUM ('SQUARE', 'PORTRAIT', 'LANDSCAPE');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "purpose" "MediaAssetPurpose" NOT NULL DEFAULT 'POST',
    "kind" "MediaAssetKind" NOT NULL,
    "status" "MediaAssetStatus" NOT NULL,
    "source_key" TEXT,
    "source_mime" TEXT NOT NULL,
    "source_size_bytes" INTEGER NOT NULL,
    "source_width" INTEGER,
    "source_height" INTEGER,
    "duration_ms" INTEGER,
    "format" "MediaFormat",
    "crop_x" DOUBLE PRECISION,
    "crop_y" DOUBLE PRECISION,
    "crop_w" DOUBLE PRECISION,
    "crop_h" DOUBLE PRECISION,
    "key" TEXT,
    "feed_key" TEXT,
    "thumb_key" TEXT,
    "poster_key" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "size_bytes" INTEGER,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "failure_reason" TEXT,
    "post_id" TEXT,
    "position" INTEGER,
    "attached_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_source_key_key" ON "media_assets"("source_key");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_key_key" ON "media_assets"("key");

-- CreateIndex
CREATE INDEX "media_assets_post_id_position_idx" ON "media_assets"("post_id", "position");

-- CreateIndex
CREATE INDEX "media_assets_uploader_id_created_at_idx" ON "media_assets"("uploader_id", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_status_created_at_idx" ON "media_assets"("status", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_attached_at_created_at_idx" ON "media_assets"("attached_at", "created_at");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

