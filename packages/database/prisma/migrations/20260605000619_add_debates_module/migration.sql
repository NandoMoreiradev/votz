-- CreateEnum
CREATE TYPE "DebateStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('MODERATOR', 'DEBATER');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('APPLAUSE', 'FIRE', 'POSITIVE', 'QUESTION', 'DISAGREEMENT');

-- CreateTable
CREATE TABLE "debates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "DebateStatus" NOT NULL DEFAULT 'SCHEDULED',
    "livekitRoomName" TEXT,
    "hlsUrl" TEXT,
    "recordingUrl" TEXT,
    "egressId" TEXT,
    "viewerCount" INTEGER NOT NULL DEFAULT 0,
    "chatCooldownSecs" INTEGER NOT NULL DEFAULT 5,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debate_participants" (
    "id" TEXT NOT NULL,
    "debateId" TEXT NOT NULL,
    "politicianId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'DEBATER',
    "inviteStatus" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debate_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debate_questions" (
    "id" TEXT NOT NULL,
    "debateId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "answered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debate_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debate_reactions" (
    "id" TEXT NOT NULL,
    "debateId" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debate_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debate_messages" (
    "id" TEXT NOT NULL,
    "debateId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debate_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debate_polls" (
    "id" TEXT NOT NULL,
    "debateId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debate_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debate_poll_options" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "totalVotes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "debate_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debate_poll_votes" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "debate_poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_politician_followers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "politicianId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_politician_followers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "debates_livekitRoomName_key" ON "debates"("livekitRoomName");

-- CreateIndex
CREATE UNIQUE INDEX "debate_participants_debateId_politicianId_key" ON "debate_participants"("debateId", "politicianId");

-- CreateIndex
CREATE UNIQUE INDEX "debate_poll_votes_pollId_userId_key" ON "debate_poll_votes"("pollId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_politician_followers_userId_politicianId_key" ON "user_politician_followers"("userId", "politicianId");

-- AddForeignKey
ALTER TABLE "debates" ADD CONSTRAINT "debates_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "politicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_participants" ADD CONSTRAINT "debate_participants_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_participants" ADD CONSTRAINT "debate_participants_politicianId_fkey" FOREIGN KEY ("politicianId") REFERENCES "politicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_questions" ADD CONSTRAINT "debate_questions_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_questions" ADD CONSTRAINT "debate_questions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_reactions" ADD CONSTRAINT "debate_reactions_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_messages" ADD CONSTRAINT "debate_messages_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_messages" ADD CONSTRAINT "debate_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_polls" ADD CONSTRAINT "debate_polls_debateId_fkey" FOREIGN KEY ("debateId") REFERENCES "debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_poll_options" ADD CONSTRAINT "debate_poll_options_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "debate_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_poll_votes" ADD CONSTRAINT "debate_poll_votes_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "debate_polls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_poll_votes" ADD CONSTRAINT "debate_poll_votes_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "debate_poll_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_poll_votes" ADD CONSTRAINT "debate_poll_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_politician_followers" ADD CONSTRAINT "user_politician_followers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_politician_followers" ADD CONSTRAINT "user_politician_followers_politicianId_fkey" FOREIGN KEY ("politicianId") REFERENCES "politicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
