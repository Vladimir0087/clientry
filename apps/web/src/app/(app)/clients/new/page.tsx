import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { CreateClientForm } from '@/features/client-form';
import { PageHeading } from '@/shared/ui/page-heading';

export const metadata: Metadata = { title: 'New client' };

export default function NewClientPage(): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <PageHeading>New client</PageHeading>
      <CreateClientForm />
    </div>
  );
}
