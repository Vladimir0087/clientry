import type { ReactNode } from 'react';

import { GreetingSkeleton } from './_components/greeting-skeleton';

export default function AppLoading(): ReactNode {
  return <GreetingSkeleton />;
}
