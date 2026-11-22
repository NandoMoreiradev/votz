-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN "ad_creative_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_ad_creative_id_key" ON "media_assets"("ad_creative_id");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_ad_creative_id_fkey" FOREIGN KEY ("ad_creative_id") REFERENCES "ad_creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Um arquivo é de uma publicação OU de um criativo de anúncio, nunca dos dois; e criativo só recebe arquivo feito para anúncio.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_check" CHECK ("post_id" IS NULL OR "ad_creative_id" IS NULL);
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_ad_purpose_check" CHECK ("ad_creative_id" IS NULL OR "purpose" = 'AD_CREATIVE');
