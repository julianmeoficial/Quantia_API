-- Chat General v2: predefined avatars, ordered seq/version, replies, edit/delete
-- metadata, reactions and per-user read pointers. Additive only.

-- CreateEnum
CREATE TYPE "AvatarKey" AS ENUM ('AVATAR_01', 'AVATAR_02', 'AVATAR_03', 'AVATAR_04', 'AVATAR_05');

-- AlterTable: users.avatar (null until the user picks one; chat requires it)
ALTER TABLE "users" ADD COLUMN "avatar" "AvatarKey";

-- AlterTable: message metadata
ALTER TABLE "general_chat_messages"
  ADD COLUMN "deleted_by_id" UUID,
  ADD COLUMN "edited_at" TIMESTAMP(3),
  ADD COLUMN "reply_to_id" UUID,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- seq: BIGSERIAL equivalent, backfilled in chronological order so existing
-- history keeps its order (a plain BIGSERIAL would number rows physically).
CREATE SEQUENCE "general_chat_messages_seq_seq" AS BIGINT;
ALTER TABLE "general_chat_messages" ADD COLUMN "seq" BIGINT;
UPDATE "general_chat_messages" m
SET "seq" = o.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS rn
  FROM "general_chat_messages"
) o
WHERE m."id" = o."id";
SELECT setval(
  '"general_chat_messages_seq_seq"',
  COALESCE((SELECT MAX("seq") FROM "general_chat_messages"), 0) + 1,
  false
);
ALTER TABLE "general_chat_messages"
  ALTER COLUMN "seq" SET DEFAULT nextval('"general_chat_messages_seq_seq"'),
  ALTER COLUMN "seq" SET NOT NULL;
ALTER SEQUENCE "general_chat_messages_seq_seq" OWNED BY "general_chat_messages"."seq";

-- CreateTable
CREATE TABLE "general_chat_reactions" (
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "general_chat_reactions_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateTable
CREATE TABLE "general_chat_read_states" (
    "user_id" UUID NOT NULL,
    "last_read_seq" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "general_chat_read_states_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "general_chat_reactions_message_id_idx" ON "general_chat_reactions"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "general_chat_messages_seq_key" ON "general_chat_messages"("seq");

-- CreateIndex
CREATE INDEX "general_chat_messages_updated_at_id_idx" ON "general_chat_messages"("updated_at", "id");

-- AddForeignKey
ALTER TABLE "general_chat_messages" ADD CONSTRAINT "general_chat_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "general_chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_chat_reactions" ADD CONSTRAINT "general_chat_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "general_chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_chat_reactions" ADD CONSTRAINT "general_chat_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_chat_read_states" ADD CONSTRAINT "general_chat_read_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-by-default RLS for PostgREST (Nest Prisma role is not forced), aligned to F7.
ALTER TABLE "general_chat_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "general_chat_read_states" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "general_chat_reactions", "general_chat_read_states" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "general_chat_reactions", "general_chat_read_states" FROM authenticated;
  END IF;
END
$$;
