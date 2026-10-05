import type { ReactNode } from 'react';

import { Card } from '@/shared/ui/card';
import { ThemeMenu } from '@/shared/ui/theme-menu';

interface AuthLayoutProps {
  readonly children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps): ReactNode {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 py-16">
      <header className="absolute top-4 right-4">
        <ThemeMenu />
      </header>
      <main className="flex w-full max-w-100 flex-col gap-6">
        <p className="text-center text-xl font-semibold tracking-tight">Clientry</p>
        <Card>{children}</Card>
      </main>
    </div>
  );
}
