import type * as React from 'react';

import { LocalDate } from '@/shared/ui/local-date';
import type { Client } from '@clientry/shared/clients';

import { ClientTagList } from './client-tag-list';
import { sourceLabel } from '../model/source-label';

const EMPTY = '—';
const PHONE_DIALABLE = /[^\d+]/g;

// tel: takes the digits and the leading plus; the phone itself is shown as typed.
function telHref(phone: string): string {
  return `tel:${phone.replace(PHONE_DIALABLE, '')}`;
}

interface DetailProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

function Detail({ label, children }: DetailProps): React.JSX.Element {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const LINK_CLASS = 'underline underline-offset-4';

export function ClientDetails({ client }: { readonly client: Client }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-col gap-3">
        <Detail label="Email">
          {client.email === null ? (
            EMPTY
          ) : (
            <a href={`mailto:${client.email}`} className={LINK_CLASS}>
              {client.email}
            </a>
          )}
        </Detail>
        <Detail label="Phone">
          {client.phone === null ? (
            EMPTY
          ) : (
            <a href={telHref(client.phone)} className={LINK_CLASS}>
              {client.phone}
            </a>
          )}
        </Detail>
        <Detail label="Source">
          {client.source === null ? EMPTY : sourceLabel(client.source)}
        </Detail>
        <Detail label="Tags">
          {client.tags.length === 0 ? EMPTY : <ClientTagList tags={client.tags} isLinked />}
        </Detail>
        <Detail label="Notes">
          {client.notes === null ? (
            <span className="text-muted-foreground">No notes</span>
          ) : (
            <p className="whitespace-pre-line">{client.notes}</p>
          )}
        </Detail>
      </dl>
      <p className="text-sm text-muted-foreground">
        Added by {client.createdBy.name} on <LocalDate value={client.createdAt} /> · Updated{' '}
        <LocalDate value={client.updatedAt} />
      </p>
    </div>
  );
}
