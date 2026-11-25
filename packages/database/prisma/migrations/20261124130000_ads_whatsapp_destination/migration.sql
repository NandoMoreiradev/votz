-- Anúncios: destino WhatsApp. Número (só dígitos, com 55) e mensagem inicial; o endereço wa.me é montado a partir deles.
ALTER TABLE "ad_creatives" ADD COLUMN "whatsapp_phone" TEXT;
ALTER TABLE "ad_creatives" ADD COLUMN "whatsapp_text" TEXT;
