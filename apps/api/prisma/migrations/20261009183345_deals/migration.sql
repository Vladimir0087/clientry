-- CreateEnum
CREATE TYPE "currency" AS ENUM ('USD', 'EUR', 'PLN', 'BYN', 'RUB');

-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('deal_created', 'deal_moved', 'deal_updated', 'deal_deleted', 'deal_restored');

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" "currency" NOT NULL,
    -- Added by hand: fractional keys compare byte by byte, whatever the database default.
    "position" TEXT COLLATE "C" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "type" "activity_type" NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deals_stage_id_position_id_idx" ON "deals"("stage_id", "position", "id");

-- CreateIndex
CREATE INDEX "deals_workspace_id_stage_id_closed_at_id_idx" ON "deals"("workspace_id", "stage_id", "closed_at", "id");

-- CreateIndex
CREATE INDEX "deals_client_id_created_at_idx" ON "deals"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "activities_deal_id_created_at_id_idx" ON "activities"("deal_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
