-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "activity_type" ADD VALUE 'client_created';
ALTER TYPE "activity_type" ADD VALUE 'task_created';
ALTER TYPE "activity_type" ADD VALUE 'task_completed';

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "client_id" UUID,
ADD COLUMN     "task_id" UUID,
ALTER COLUMN "deal_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "activities_workspace_id_created_at_id_idx" ON "activities"("workspace_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
