-- CreateEnum
CREATE TYPE "CommentMediaType" AS ENUM ('TEXT', 'AUDIO', 'VIDEO');

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "mediaDuration" INTEGER,
ADD COLUMN     "mediaKey" TEXT,
ADD COLUMN     "mediaType" "CommentMediaType" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "mediaUrl" TEXT,
ADD COLUMN     "transcript" TEXT;

