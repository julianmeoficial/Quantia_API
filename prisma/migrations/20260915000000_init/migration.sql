-- CreateTable
CREATE TABLE "bootstrap_meta" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bootstrap_meta_pkey" PRIMARY KEY ("id")
);
