-- Debates com transmissão pelo YouTube: provedor do vídeo, anfitrião político OU entidade e canais verificados.
-- CreateEnum
CREATE TYPE "StreamProvider" AS ENUM ('LIVEKIT', 'YOUTUBE');

-- AlterTable
ALTER TABLE "debate_participants" ADD COLUMN     "youtube_channel_title" TEXT,
ADD COLUMN     "youtube_video_id" TEXT;

-- AlterTable
ALTER TABLE "debates" ADD COLUMN     "host_entity_id" TEXT,
ADD COLUMN     "streamProvider" "StreamProvider" NOT NULL DEFAULT 'LIVEKIT',
ADD COLUMN     "youtube_channel_id" TEXT,
ADD COLUMN     "youtube_channel_title" TEXT,
ADD COLUMN     "youtube_video_id" TEXT,
ALTER COLUMN "creatorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "youtube_channels" (
    "id" TEXT NOT NULL,
    "org_type" "OrgType" NOT NULL,
    "org_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "verification_code" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "youtube_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "youtube_channels_channel_id_key" ON "youtube_channels"("channel_id");

-- CreateIndex
CREATE INDEX "youtube_channels_org_type_org_id_idx" ON "youtube_channels"("org_type", "org_id");

-- AddForeignKey
ALTER TABLE "debates" ADD CONSTRAINT "debates_host_entity_id_fkey" FOREIGN KEY ("host_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Todo debate tem exatamente um anfitrião (político ou entidade). O Prisma não modela CHECK, então fica só no SQL.
ALTER TABLE "debates" ADD CONSTRAINT "debates_exactly_one_host" CHECK (num_nonnulls("creatorId", "host_entity_id") = 1);
