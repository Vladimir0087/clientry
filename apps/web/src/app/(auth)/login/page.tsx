import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { LoginView } from '@/features/auth';
import { NEXT_PARAM } from '@/shared/lib/redirect-target';
import { CardContent, CardHeader } from '@/shared/ui/card';

export const metadata: Metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>): Promise<ReactNode> {
  const next = (await searchParams)[NEXT_PARAM];
  return (
    <>
      <CardHeader>
        <h1 className="text-lg font-semibold">Log in to Clientry</h1>
      </CardHeader>
      <CardContent>
        <LoginView next={typeof next === 'string' ? next : undefined} />
      </CardContent>
    </>
  );
}
