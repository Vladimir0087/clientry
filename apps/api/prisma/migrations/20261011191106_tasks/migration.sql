-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('task_reminder');

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "client_id" UUID,
    "deal_id" UUID,
    "title" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "remind_at" TIMESTAMPTZ(3),
    "reminder_sent_at" TIMESTAMPTZ(3),
    "done_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID,
    "type" "notification_type" NOT NULL,
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_workspace_id_done_at_due_at_id_idx" ON "tasks"("workspace_id", "done_at", "due_at", "id");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_done_at_due_at_id_idx" ON "tasks"("assignee_id", "done_at", "due_at", "id");

-- CreateIndex
CREATE INDEX "tasks_client_id_due_at_idx" ON "tasks"("client_id", "due_at");

-- CreateIndex
CREATE INDEX "tasks_deal_id_due_at_idx" ON "tasks"("deal_id", "due_at");

-- CreateIndex
CREATE INDEX "tasks_remind_at_idx" ON "tasks"("remind_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_id_idx" ON "notifications"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_workspace_id_idx" ON "notifications"("user_id", "read_at", "workspace_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
