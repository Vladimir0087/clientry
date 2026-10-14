import type { ReactNode } from 'react';

import { DashboardSkeleton } from './_components/dashboard-skeleton';

export default function AppLoading(): ReactNode {
  return <DashboardSkeleton />;
}
