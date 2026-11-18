ALTER TABLE "conversations" ADD COLUMN "matrix_room_id" TEXT;
CREATE UNIQUE INDEX "conversations_matrix_room_id_key" ON "conversations"("matrix_room_id");
CREATE TABLE "chat_devices" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "platform" VARCHAR(20) NOT NULL,
  "secret_hash" TEXT NOT NULL,
  "matrix_token" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "chat_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "chat_devices_user_id_revoked_at_idx" ON "chat_devices"("user_id", "revoked_at");
-- The first text pilot permits one active encrypted device per account.
-- A new device never silently replaces the trusted device of that account.
CREATE UNIQUE INDEX "chat_devices_one_active_per_user" ON "chat_devices"("user_id") WHERE "revoked_at" IS NULL;
