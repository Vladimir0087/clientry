import type { ReactNode } from 'react';

interface StatusPageProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function StatusPage({ title, children }: StatusPageProps): ReactNode {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}
