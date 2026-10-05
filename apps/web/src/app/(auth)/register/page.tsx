import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { RegisterForm } from '@/features/auth';
import { NEXT_PARAM } from '@/shared/lib/redirect-target';
import { CardContent, CardHeader } from '@/shared/ui/card';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage({
  searchParams,
}: PageProps<'/register'>): Promise<ReactNode> {
  const next = (await searchParams)[NEXT_PARAM];
  return (
    <>
      <CardHeader>
        <h1 className="text-lg font-semibold">Create your workspace</h1>
      </CardHeader>
      <CardContent>
        <RegisterForm next={typeof next === 'string' ? next : undefined} />
      </CardContent>
    </>
  );
}
