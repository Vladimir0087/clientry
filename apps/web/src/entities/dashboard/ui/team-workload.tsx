import type { Route } from 'next';
import Link from 'next/link';
import type * as React from 'react';

import { formatTotals } from '@/shared/lib/money';
import { Badge } from '@/shared/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import type { MemberWorkload } from '@clientry/shared/dashboard';

const LINK_CLASS =
  'rounded-sm font-medium tabular-nums underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50';

export interface TeamWorkloadLinks {
  // Built by the app: entities do not import each other.
  readonly dealsHref: (memberId: string) => Route;
  readonly tasksHref: (memberId: string) => Route;
}

interface TeamWorkloadProps extends TeamWorkloadLinks {
  readonly members: readonly MemberWorkload[];
  readonly currentUserId: string | undefined;
}

interface CountLinkProps {
  readonly count: number;
  readonly href: Route;
  readonly label: string;
}

// Zero is plain text: a filter that lists nothing is not worth a link.
function CountLink({ count, href, label }: CountLinkProps): React.JSX.Element {
  if (count === 0) {
    return <span className="tabular-nums">0</span>;
  }
  return (
    <Link href={href} aria-label={label} className={LINK_CLASS}>
      {count}
    </Link>
  );
}

function Overdue({ count }: { readonly count: number }): React.JSX.Element {
  return count > 0 ? (
    <Badge variant="danger">{count}</Badge>
  ) : (
    <span className="tabular-nums">0</span>
  );
}

interface WorkloadProps {
  readonly workload: MemberWorkload;
  readonly links: TeamWorkloadLinks;
}

function MemberName({
  workload,
  isYou,
}: {
  readonly workload: MemberWorkload;
  readonly isYou: boolean;
}): React.JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium">{workload.member.name}</span>
      {isYou && <Badge variant="secondary">You</Badge>}
    </span>
  );
}

function DealsCount({ workload, links }: WorkloadProps): React.JSX.Element {
  const { member, openDeals } = workload;
  return (
    <CountLink
      count={openDeals.count}
      href={links.dealsHref(member.id)}
      label={`${String(openDeals.count)} open deals of ${member.name}`}
    />
  );
}

function TasksCount({ workload, links }: WorkloadProps): React.JSX.Element {
  const { member, openTasks } = workload;
  return (
    <CountLink
      count={openTasks}
      href={links.tasksHref(member.id)}
      label={`${String(openTasks)} open tasks of ${member.name}`}
    />
  );
}

function pipelineText({ openDeals }: MemberWorkload): string {
  return openDeals.count === 0 ? '—' : formatTotals(openDeals.totals);
}

// From md a table, below it cards with the same content; CSS hides the other one.
export function TeamWorkload({
  members,
  currentUserId,
  dealsHref,
  tasksHref,
}: TeamWorkloadProps): React.JSX.Element {
  const links = { dealsHref, tasksHref };
  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Open deals</TableHead>
              <TableHead>In pipeline</TableHead>
              <TableHead>Open tasks</TableHead>
              <TableHead>Overdue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((workload) => (
              <TableRow key={workload.member.id}>
                <TableCell>
                  <MemberName workload={workload} isYou={workload.member.id === currentUserId} />
                </TableCell>
                <TableCell>
                  <DealsCount workload={workload} links={links} />
                </TableCell>
                <TableCell className="whitespace-normal">{pipelineText(workload)}</TableCell>
                <TableCell>
                  <TasksCount workload={workload} links={links} />
                </TableCell>
                <TableCell>
                  <Overdue count={workload.overdueTasks} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {members.map((workload) => (
          <li
            key={workload.member.id}
            className="flex flex-col gap-2 rounded-lg border p-4 text-sm"
          >
            <MemberName workload={workload} isYou={workload.member.id === currentUserId} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Open deals</dt>
              <dd>
                <DealsCount workload={workload} links={links} />
              </dd>
              <dt className="text-muted-foreground">In pipeline</dt>
              <dd className="break-words">{pipelineText(workload)}</dd>
              <dt className="text-muted-foreground">Open tasks</dt>
              <dd>
                <TasksCount workload={workload} links={links} />
              </dd>
              <dt className="text-muted-foreground">Overdue</dt>
              <dd>
                <Overdue count={workload.overdueTasks} />
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
