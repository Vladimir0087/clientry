import Link from 'next/link';
import type * as React from 'react';

import { Button } from '@/shared/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { PageHeading } from '@/shared/ui/page-heading';

import { DEALS_PATH } from '../model/deal-path';

export function DealNotFound(): React.JSX.Element {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          <PageHeading className="text-lg">Deal not found</PageHeading>
        </EmptyTitle>
        <EmptyDescription>It may have been deleted.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" asChild>
          <Link href={DEALS_PATH}>Back to deals</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
