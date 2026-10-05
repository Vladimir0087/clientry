'use client';

import type { ReactNode } from 'react';

import { Button } from '@/shared/ui/button';

import { StatusPage } from './_components/status-page';

interface ErrorPageProps {
  // Unlike reset, retry refetches the server payload that failed.
  readonly retry: () => void;
}

export default function ErrorPage({ retry }: ErrorPageProps): ReactNode {
  return (
    <StatusPage title="Something went wrong">
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </StatusPage>
  );
}
