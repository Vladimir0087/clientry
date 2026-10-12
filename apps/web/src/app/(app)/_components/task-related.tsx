import type { Route } from 'next';
import Link from 'next/link';
import type * as React from 'react';

import { clientPath } from '@/entities/client';
import { dealPath } from '@/entities/deal';
import type { TaskRelated } from '@clientry/shared/tasks';

// Where a row is shown: a client card already names its client, a deal page its deal.
export type TaskRowPlace = 'list' | 'client' | 'deal';

const LINK_CLASS =
  'rounded-sm break-words underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50';

interface RelatedLinkProps {
  readonly href: Route;
  readonly kind: string;
  readonly children: React.ReactNode;
}

function RelatedLink({ href, kind, children }: RelatedLinkProps): React.JSX.Element {
  return (
    <Link href={href} className={LINK_CLASS}>
      <span className="sr-only">{kind}</span> {children}
    </Link>
  );
}

interface TaskRelatedLinksProps {
  readonly related: TaskRelated | null;
  readonly place: TaskRowPlace;
}

export function TaskRelatedLinks({
  related,
  place,
}: TaskRelatedLinksProps): React.JSX.Element | null {
  if (related === null || place === 'deal') {
    return null;
  }
  if (related.kind === 'client') {
    return place === 'list' ? (
      <RelatedLink href={clientPath(related.id)} kind="Client">
        {related.name}
      </RelatedLink>
    ) : null;
  }
  return (
    <span className="flex flex-wrap gap-x-1">
      <RelatedLink href={dealPath(related.id)} kind="Deal">
        {related.title}
      </RelatedLink>
      {place === 'list' && (
        <>
          <span aria-hidden="true">·</span>
          <RelatedLink href={clientPath(related.client.id)} kind="Client">
            {related.client.name}
          </RelatedLink>
        </>
      )}
    </span>
  );
}

// The task page's "Related to": the client card, or the deal page named with its client.
export function TaskRelatedDetail({
  related,
}: {
  readonly related: TaskRelated;
}): React.JSX.Element {
  return related.kind === 'client' ? (
    <Link href={clientPath(related.id)} className={LINK_CLASS}>
      {related.name}
    </Link>
  ) : (
    <Link href={dealPath(related.id)} className={LINK_CLASS}>
      {related.title} · {related.client.name}
    </Link>
  );
}
