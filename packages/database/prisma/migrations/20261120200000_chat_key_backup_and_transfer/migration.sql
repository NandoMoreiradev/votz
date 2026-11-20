-- CreateTable
CREATE TABLE "chat_key_backups" (
    "user_id" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_key_backups_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "chat_history_transfers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_device_id" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_history_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_history_transfers_user_id_expires_at_idx" ON "chat_history_transfers"("user_id", "expires_at");

-- AddForeignKey
ALTER TABLE "chat_key_backups" ADD CONSTRAINT "chat_key_backups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_history_transfers" ADD CONSTRAINT "chat_history_transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
