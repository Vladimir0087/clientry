import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/shared/ui/button';

import { StatusPage } from './_components/status-page';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound(): ReactNode {
  return (
    <StatusPage title="Page not found">
      <Button asChild variant="outline">
        <Link href="/">Go home</Link>
      </Button>
    </StatusPage>
  );
}
