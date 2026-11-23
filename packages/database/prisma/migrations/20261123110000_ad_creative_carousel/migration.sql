-- Carrossel no anúncio: até 5 fotos (ou um vídeo sozinho) por criativo, na ordem de `position`.
-- Antes era uma mídia por criativo (índice único); agora o índice é comum e ordenado.
DROP INDEX "media_assets_ad_creative_id_key";
CREATE INDEX "media_assets_ad_creative_id_position_idx" ON "media_assets"("ad_creative_id", "position");
