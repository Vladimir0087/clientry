-- Added by hand: trigram indexes need pg_trgm, which schema.prisma does not manage.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "client_source" AS ENUM ('website', 'telegram', 'referral', 'other');

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    -- Added by hand: one case-insensitive name order on every database, whatever its default.
    "name" TEXT COLLATE "und-x-icu" NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" "client_source",
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_workspace_id_created_at_id_idx" ON "clients"("workspace_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "clients_workspace_id_name_id_idx" ON "clients"("workspace_id", "name", "id");

-- CreateIndex
CREATE INDEX "clients_created_by_id_idx" ON "clients"("created_by_id");

-- CreateIndex
CREATE INDEX "clients_tags_idx" ON "clients" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_company_idx" ON "clients" USING GIN ("company" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_email_idx" ON "clients" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_phone_idx" ON "clients" USING GIN ("phone" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
