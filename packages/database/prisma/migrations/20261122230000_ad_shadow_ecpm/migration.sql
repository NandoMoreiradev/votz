-- A sombra compara o valor por mil exibições (eCPM), não o preço: clique e mil exibições têm unidades diferentes.
ALTER TABLE "ad_shadow_decisions" DROP COLUMN "served_price_cents",
DROP COLUMN "shadow_price_cents",
ADD COLUMN "served_ecpm_cents" DOUBLE PRECISION,
ADD COLUMN "shadow_ecpm_cents" DOUBLE PRECISION;
