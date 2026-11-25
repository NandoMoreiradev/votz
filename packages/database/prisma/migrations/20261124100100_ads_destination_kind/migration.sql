-- Anúncios: para onde o botão leva (site do anunciante, chat da página no Votz ou WhatsApp). Todo anúncio existente é URL.
CREATE TYPE "AdDestinationKind" AS ENUM ('URL', 'PAGE_MESSAGE', 'WHATSAPP');

ALTER TABLE "ad_creatives" ADD COLUMN "destination_kind" "AdDestinationKind" NOT NULL DEFAULT 'URL';
