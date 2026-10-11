'use client';

import type * as React from 'react';

import { DEALS_PATH } from '@/entities/deal';
import { StageManager } from '@/features/manage-stages';
import { BackLink } from '@/shared/ui/back-link';
import { PageHeading } from '@/shared/ui/page-heading';

const HEADING_ID = 'stages-heading';

export function StagesView(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={DEALS_PATH}>Deals</BackLink>
      <div className="flex flex-col gap-1">
        <PageHeading id={HEADING_ID}>Stages</PageHeading>
        <p className="text-muted-foreground">
          Deals move through these stages from left to right on the board.
        </p>
      </div>
      <StageManager headingId={HEADING_ID} />
    </div>
  );
}
