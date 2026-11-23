-- Imprensa, fase 4: "aceito falar com a imprensa" no relato e pedido de contato (consentimento do cidadão).

CREATE TYPE "PressContactStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
CREATE TYPE "PressContactDeclineReason" AS ENUM ('NOT_NOW', 'NOT_INTERESTED', 'ABUSIVE');

ALTER TABLE "reports" ADD COLUMN "press_contact_ok" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "press_contact_requests" (
    "id" TEXT NOT NULL,
    "journalist_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "outlet_name" VARCHAR(120) NOT NULL,
    "outlet_type" "PressOutletType" NOT NULL,
    "outlet_website" VARCHAR(300) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "status" "PressContactStatus" NOT NULL DEFAULT 'PENDING',
    "decline_reason" "PressContactDeclineReason",
    "reply" VARCHAR(300),
    "via_votz_chat" BOOLEAN NOT NULL DEFAULT false,
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "press_contact_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "press_contact_blocks" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "journalist_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "press_contact_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "press_contact_requests_journalist_id_report_id_key" ON "press_contact_requests"("journalist_id", "report_id");
CREATE INDEX "press_contact_requests_recipient_id_status_created_at_idx" ON "press_contact_requests"("recipient_id", "status", "created_at");
CREATE INDEX "press_contact_requests_journalist_id_created_at_idx" ON "press_contact_requests"("journalist_id", "created_at");
CREATE UNIQUE INDEX "press_contact_blocks_recipient_id_journalist_id_key" ON "press_contact_blocks"("recipient_id", "journalist_id");

ALTER TABLE "press_contact_requests" ADD CONSTRAINT "press_contact_requests_journalist_id_fkey" FOREIGN KEY ("journalist_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_contact_requests" ADD CONSTRAINT "press_contact_requests_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_contact_requests" ADD CONSTRAINT "press_contact_requests_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_contact_blocks" ADD CONSTRAINT "press_contact_blocks_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_contact_blocks" ADD CONSTRAINT "press_contact_blocks_journalist_id_fkey" FOREIGN KEY ("journalist_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
