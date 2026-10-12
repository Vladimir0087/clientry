import { Injectable } from '@nestjs/common';

import type { Task } from '@clientry/shared/tasks';

import { PrismaTasksTransaction } from './prisma-tasks-transaction.repository.js';
import { findTask, listTasks } from './task-reads.repository.js';
import type {
  TaskListFilter,
  TaskPage,
  TaskPageRequest,
  TasksRepository,
  TasksTransaction,
} from './tasks.repository.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

@Injectable()
export class PrismaTasksRepository implements TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(workspaceId: string, id: string): Promise<Task | null> {
    return findTask(this.prisma, workspaceId, id);
  }

  // One extra row tells whether a next page exists without counting.
  async list(
    workspaceId: string,
    filter: TaskListFilter,
    { after, limit }: TaskPageRequest,
  ): Promise<TaskPage> {
    const rows = await listTasks(this.prisma, workspaceId, filter, after, limit + 1);
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  }

  inTransaction<T>(work: (tasks: TasksTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(new PrismaTasksTransaction(tx)));
  }
}
