import Link from 'next/link';
import type * as React from 'react';

import { Button } from '@/shared/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { PageHeading } from '@/shared/ui/page-heading';

import { CLIENTS_PATH } from '../model/client-path';

export function ClientNotFound(): React.JSX.Element {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          <PageHeading className="text-lg">Client not found</PageHeading>
        </EmptyTitle>
        <EmptyDescription>It may have been deleted.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" asChild>
          <Link href={CLIENTS_PATH}>Back to clients</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
