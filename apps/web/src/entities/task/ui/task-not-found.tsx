import Link from 'next/link';
import type * as React from 'react';

import { Button } from '@/shared/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { PageHeading } from '@/shared/ui/page-heading';

import { TASKS_PATH } from '../model/task-path';

export function TaskNotFound(): React.JSX.Element {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          <PageHeading className="text-lg">Task not found</PageHeading>
        </EmptyTitle>
        <EmptyDescription>It may have been deleted.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" asChild>
          <Link href={TASKS_PATH}>Back to tasks</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
