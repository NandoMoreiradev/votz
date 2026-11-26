-- CreateTable
CREATE TABLE "user_notification_preferences" (
    "user_id" TEXT NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "report_updates" BOOLEAN NOT NULL DEFAULT true,
    "report_comments" BOOLEAN NOT NULL DEFAULT true,
    "official_responses" BOOLEAN NOT NULL DEFAULT true,
    "local_surges" BOOLEAN NOT NULL DEFAULT true,
    "official_surveys" BOOLEAN NOT NULL DEFAULT true,
    "mentions" BOOLEAN NOT NULL DEFAULT true,
    "weekly_digest" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" INTEGER,
    "quiet_hours_end" INTEGER,
    "default_anonymous_reports" BOOLEAN NOT NULL DEFAULT false,
    "public_activity_visible" BOOLEAN NOT NULL DEFAULT true,
    "accept_press_contact" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
