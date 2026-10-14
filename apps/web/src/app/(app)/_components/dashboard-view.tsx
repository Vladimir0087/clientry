'use client';

import { cn } from 'cn';
import type { Route } from 'next';
import Link from 'next/link';
import { useId } from 'react';
import type * as React from 'react';

import { ActivityFeedList, ActivitySkeleton, useActivityFeed } from '@/entities/activity';
import type { SubjectHref } from '@/entities/activity';
import { clientPath } from '@/entities/client';
import {
  DashboardTiles,
  TeamSkeleton,
  TeamWorkload,
  TilesSkeleton,
  useClosedDeals,
  useDashboardSummary,
  usePeriodBounds,
} from '@/entities/dashboard';
import { DEALS_PATH, dealPath } from '@/entities/deal';
import { useSession } from '@/entities/session';
import { TASKS_PATH, taskPath } from '@/entities/task';
import { PipelineChart, WonDealsSection } from '@/features/dashboard-charts';
import { PageHeading } from '@/shared/ui/page-heading';
import { RetryMessage } from '@/shared/ui/retry-message';
import { Skeleton } from '@/shared/ui/skeleton';
import type { DashboardSummary } from '@clientry/shared/dashboard';

const LINK_CLASS =
  'rounded-sm text-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50';

const subjectHref: SubjectHref = (subject) => {
  switch (subject.kind) {
    case 'deal':
      return dealPath(subject.id);
    case 'client':
      return clientPath(subject.id);
    case 'task':
      return taskPath(subject.id);
  }
};

function memberFilterPath(path: string, memberId: string): Route {
  return `${path}?${new URLSearchParams({ assignee: memberId }).toString()}` as Route;
}

const teamLinks = {
  dealsHref: (memberId: string): Route => memberFilterPath(DEALS_PATH, memberId),
  tasksHref: (memberId: string): Route => memberFilterPath(TASKS_PATH, memberId),
};

interface SectionProps {
  readonly title: string;
  readonly headingId: string;
  readonly action?: React.ReactNode;
  readonly className?: string;
  readonly children: React.ReactNode;
}

function Section({
  title,
  headingId,
  action,
  className,
  children,
}: SectionProps): React.JSX.Element {
  return (
    <section aria-labelledby={headingId} className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} tabIndex={-1} className="text-lg font-semibold outline-none">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PipelineSection({ summary }: { readonly summary: DashboardSummary }): React.JSX.Element {
  const headingId = useId();
  const boardLink = (
    <Link href={DEALS_PATH} className={LINK_CLASS}>
      Open board
    </Link>
  );
  return (
    <Section title="Pipeline" headingId={headingId} action={boardLink}>
      {summary.openDeals.count === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open deals. Add one on the{' '}
          <Link href={DEALS_PATH} className={LINK_CLASS}>
            board
          </Link>
          .
        </p>
      ) : (
        <PipelineChart stages={summary.stages} labelledBy={headingId} />
      )}
    </Section>
  );
}

function TeamSection({ summary }: { readonly summary: DashboardSummary }): React.JSX.Element {
  const headingId = useId();
  const session = useSession();
  return (
    <Section title="Team" headingId={headingId} className="lg:col-span-2">
      <TeamWorkload
        members={summary.members}
        currentUserId={session.data?.user.id}
        {...teamLinks}
      />
    </Section>
  );
}

function ActivitySection(): React.JSX.Element {
  const headingId = useId();
  const feed = useActivityFeed();
  const handleRetry = (): void => {
    void feed.refetch();
  };
  const body = (): React.ReactNode => {
    if (feed.data !== undefined) {
      return <ActivityFeedList feed={feed} data={feed.data} subjectHref={subjectHref} />;
    }
    return feed.isError ? (
      <RetryMessage
        message="We could not load activity."
        focusTargetId={headingId}
        onRetry={handleRetry}
      />
    ) : (
      <ActivitySkeleton />
    );
  };
  return (
    <Section title="Activity" headingId={headingId}>
      {body()}
    </Section>
  );
}

const DASHBOARD_HEADING_ID = 'dashboard-heading';

// Sections in reading order: tiles, Pipeline, Won deals, Team, Activity.
export function DashboardView(): React.JSX.Element {
  const summary = useDashboardSummary();
  const closedDeals = useClosedDeals(usePeriodBounds());
  const handleRetry = (): void => {
    void summary.refetch();
  };
  const tiles = (): React.ReactNode => {
    if (summary.data !== undefined) {
      return (
        <DashboardTiles
          summary={summary.data}
          closedDeals={closedDeals.data}
          isClosedDealsError={closedDeals.isError}
        />
      );
    }
    return summary.isError ? (
      <RetryMessage
        message="We could not load the dashboard."
        focusTargetId={DASHBOARD_HEADING_ID}
        onRetry={handleRetry}
      />
    ) : (
      <TilesSkeleton />
    );
  };
  return (
    <div className="flex flex-col gap-8">
      <PageHeading id={DASHBOARD_HEADING_ID}>Dashboard</PageHeading>
      {tiles()}
      <div className="grid gap-8 lg:grid-cols-2">
        {summary.data !== undefined && <PipelineSection summary={summary.data} />}
        {summary.isPending && <Skeleton className="h-60" />}
        <WonDealsSection />
      </div>
      <div className="grid gap-8 lg:grid-cols-3">
        {summary.data !== undefined && <TeamSection summary={summary.data} />}
        {summary.isPending && (
          <div className="lg:col-span-2">
            <TeamSkeleton />
          </div>
        )}
        <ActivitySection />
      </div>
    </div>
  );
}
