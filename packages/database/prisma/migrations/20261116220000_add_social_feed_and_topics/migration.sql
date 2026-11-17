-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('STANDARD', 'ADVOCACY', 'POLL', 'QUOTE');

-- CreateEnum
CREATE TYPE "PostCommentMediaType" AS ENUM ('TEXT', 'IMAGE', 'GIF', 'AUDIO');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'POST_LIKE';
ALTER TYPE "NotificationType" ADD VALUE 'POST_COMMENT';
ALTER TYPE "NotificationType" ADD VALUE 'POST_REPOST';
ALTER TYPE "NotificationType" ADD VALUE 'POST_MENTION';

-- AlterEnum
ALTER TYPE "ModerationActionType" ADD VALUE 'POST_REMOVED';
ALTER TYPE "ModerationActionType" ADD VALUE 'POST_COMMENT_REMOVED';

-- AlterEnum
ALTER TYPE "FlagTargetType" ADD VALUE 'POST';
ALTER TYPE "FlagTargetType" ADD VALUE 'POST_COMMENT';

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "kind" "PostKind" NOT NULL DEFAULT 'STANDARD',
    "media" TEXT[],
    "media_keys" TEXT[],
    "author_user_id" TEXT NOT NULL,
    "author_org_type" "OrgType",
    "author_org_id" TEXT,
    "city" TEXT,
    "city_key" TEXT,
    "state" TEXT,
    "mentioned_report_id" TEXT,
    "mentioned_debate_id" TEXT,
    "mentioned_proposta_id" TEXT,
    "mentioned_debate_poll_id" TEXT,
    "quote_post_id" TEXT,
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "reposts_count" INTEGER NOT NULL DEFAULT 0,
    "engagement_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hot_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_engaged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_polls" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "question" VARCHAR(280),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "total_votes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_poll_options" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "text" VARCHAR(100) NOT NULL,
    "position" INTEGER NOT NULL,
    "votes_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_poll_votes" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_reposts" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reposts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "author_org_type" "OrgType",
    "author_org_id" TEXT,
    "parent_id" TEXT,
    "content" VARCHAR(1000) NOT NULL,
    "media_type" "PostCommentMediaType" NOT NULL DEFAULT 'TEXT',
    "media_url" TEXT,
    "media_key" TEXT,
    "media_duration" INTEGER,
    "transcript" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "civic_topics" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_tag" TEXT NOT NULL,
    "posts_count" INTEGER NOT NULL DEFAULT 0,
    "reports_count" INTEGER NOT NULL DEFAULT 0,
    "debates_count" INTEGER NOT NULL DEFAULT 0,
    "traction_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "civic_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_topics" (
    "post_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,

    CONSTRAINT "post_topics_pkey" PRIMARY KEY ("post_id","topic_id")
);

-- CreateTable
CREATE TABLE "report_topics" (
    "report_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,

    CONSTRAINT "report_topics_pkey" PRIMARY KEY ("report_id","topic_id")
);

-- CreateTable
CREATE TABLE "debate_topics" (
    "debate_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,

    CONSTRAINT "debate_topics_pkey" PRIMARY KEY ("debate_id","topic_id")
);

-- CreateTable
CREATE TABLE "user_follows" (
    "id" TEXT NOT NULL,
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_entity_followers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_entity_followers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_topic_followers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_topic_followers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posts_hot_score_created_at_idx" ON "posts"("hot_score" DESC, "created_at" DESC);
CREATE INDEX "posts_state_city_key_hot_score_idx" ON "posts"("state", "city_key", "hot_score" DESC);
CREATE INDEX "posts_author_user_id_created_at_idx" ON "posts"("author_user_id", "created_at" DESC);
CREATE INDEX "posts_author_org_type_author_org_id_created_at_idx" ON "posts"("author_org_type", "author_org_id", "created_at" DESC);
CREATE INDEX "posts_mentioned_report_id_idx" ON "posts"("mentioned_report_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_polls_post_id_key" ON "post_polls"("post_id");
CREATE INDEX "post_poll_options_poll_id_position_idx" ON "post_poll_options"("poll_id", "position");
CREATE UNIQUE INDEX "post_poll_votes_poll_id_user_id_key" ON "post_poll_votes"("poll_id", "user_id");
CREATE UNIQUE INDEX "post_likes_post_id_user_id_key" ON "post_likes"("post_id", "user_id");
CREATE INDEX "post_likes_user_id_created_at_idx" ON "post_likes"("user_id", "created_at");
CREATE UNIQUE INDEX "post_reposts_post_id_user_id_key" ON "post_reposts"("post_id", "user_id");
CREATE INDEX "post_reposts_user_id_created_at_idx" ON "post_reposts"("user_id", "created_at");
CREATE INDEX "post_comments_post_id_created_at_idx" ON "post_comments"("post_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "civic_topics_slug_key" ON "civic_topics"("slug");
CREATE INDEX "civic_topics_traction_score_idx" ON "civic_topics"("traction_score" DESC);
CREATE INDEX "post_topics_topic_id_idx" ON "post_topics"("topic_id");
CREATE INDEX "report_topics_topic_id_idx" ON "report_topics"("topic_id");
CREATE INDEX "debate_topics_topic_id_idx" ON "debate_topics"("topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_follows_follower_id_following_id_key" ON "user_follows"("follower_id", "following_id");
CREATE UNIQUE INDEX "user_entity_followers_user_id_entity_id_key" ON "user_entity_followers"("user_id", "entity_id");
CREATE UNIQUE INDEX "user_topic_followers_user_id_topic_id_key" ON "user_topic_followers"("user_id", "topic_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_mentioned_report_id_fkey" FOREIGN KEY ("mentioned_report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_mentioned_debate_id_fkey" FOREIGN KEY ("mentioned_debate_id") REFERENCES "debates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_mentioned_proposta_id_fkey" FOREIGN KEY ("mentioned_proposta_id") REFERENCES "propostas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_mentioned_debate_poll_id_fkey" FOREIGN KEY ("mentioned_debate_poll_id") REFERENCES "debate_polls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_quote_post_id_fkey" FOREIGN KEY ("quote_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "post_polls" ADD CONSTRAINT "post_polls_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_poll_options" ADD CONSTRAINT "post_poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "post_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_poll_votes" ADD CONSTRAINT "post_poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "post_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_poll_votes" ADD CONSTRAINT "post_poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "post_poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_poll_votes" ADD CONSTRAINT "post_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_reposts" ADD CONSTRAINT "post_reposts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_reposts" ADD CONSTRAINT "post_reposts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_topics" ADD CONSTRAINT "post_topics_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_topics" ADD CONSTRAINT "post_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "civic_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_topics" ADD CONSTRAINT "report_topics_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_topics" ADD CONSTRAINT "report_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "civic_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "debate_topics" ADD CONSTRAINT "debate_topics_debate_id_fkey" FOREIGN KEY ("debate_id") REFERENCES "debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debate_topics" ADD CONSTRAINT "debate_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "civic_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_entity_followers" ADD CONSTRAINT "user_entity_followers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_entity_followers" ADD CONSTRAINT "user_entity_followers_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_topic_followers" ADD CONSTRAINT "user_topic_followers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_topic_followers" ADD CONSTRAINT "user_topic_followers_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "civic_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
