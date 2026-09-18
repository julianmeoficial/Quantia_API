-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('NOTION_TO_DB', 'DB_TO_NOTION');

-- CreateEnum
CREATE TYPE "SyncEntityType" AS ENUM ('USER', 'PROJECT', 'TASK', 'PROGRESS');

-- CreateEnum
CREATE TYPE "SyncJobName" AS ENUM ('NOTION_TO_DB', 'DB_TO_NOTION');

-- CreateEnum
CREATE TYPE "SyncEventStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SYNCED', 'PENDING', 'FAILED', 'DUPLICATE');

-- AlterTable users: Notion mirror columns
ALTER TABLE "users" ADD COLUMN "notion_page_id" TEXT;
ALTER TABLE "users" ADD COLUMN "last_edited_time" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "synced_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "sync_status" "SyncStatus" NOT NULL DEFAULT 'PENDING';

CREATE UNIQUE INDEX "users_notion_page_id_key" ON "users"("notion_page_id");

-- CreateTable sync_events
CREATE TABLE "sync_events" (
    "id" UUID NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "entity_type" "SyncEntityType" NOT NULL,
    "job_name" "SyncJobName" NOT NULL,
    "notion_page_id" TEXT,
    "entity_id" UUID,
    "status" "SyncEventStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "payload_last_edited_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_events_notion_page_id_idx" ON "sync_events"("notion_page_id");
CREATE INDEX "sync_events_status_idx" ON "sync_events"("status");
CREATE INDEX "sync_events_entity_type_entity_id_idx" ON "sync_events"("entity_type", "entity_id");
