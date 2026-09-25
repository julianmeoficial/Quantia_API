-- CreateTable
CREATE TABLE "general_chat_messages" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "client_message_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "general_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "general_chat_messages_created_at_id_idx" ON "general_chat_messages"("created_at", "id");

-- CreateIndex
CREATE INDEX "general_chat_messages_author_id_created_at_idx" ON "general_chat_messages"("author_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "general_chat_messages_author_id_client_message_id_key" ON "general_chat_messages"("author_id", "client_message_id");

-- AddForeignKey
ALTER TABLE "general_chat_messages" ADD CONSTRAINT "general_chat_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deny-by-default RLS for PostgREST (Nest Prisma role is not forced).
ALTER TABLE "general_chat_messages" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "general_chat_messages" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "general_chat_messages" FROM authenticated;
  END IF;
END
$$;
