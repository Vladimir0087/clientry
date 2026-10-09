import Link from 'next/link';
import type * as React from 'react';

import { LocalDate } from '@/shared/ui/local-date';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import type { ClientSummary } from '@clientry/shared/clients';

import { ClientTagList } from './client-tag-list';
import { clientPath } from '../model/client-path';
import { sourceLabel } from '../model/source-label';

const VISIBLE_TAGS = 3;
const EMPTY = '—';

// Every row link carries its index, so a caller can move focus to a row after loading more.
export const ROW_LINK_ATTRIBUTE = 'data-row-index';

interface ClientListProps {
  readonly items: readonly ClientSummary[];
}

function Contact({ client }: { readonly client: ClientSummary }): React.JSX.Element {
  if (client.email === null && client.phone === null) {
    return <span className="text-muted-foreground">{EMPTY}</span>;
  }
  return (
    <span className="flex min-w-0 flex-col">
      {client.email !== null && <span className="truncate">{client.email}</span>}
      {client.phone !== null && <span className="text-muted-foreground">{client.phone}</span>}
    </span>
  );
}

function ClientTable({ items }: ClientListProps): React.JSX.Element {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[22%]">Name</TableHead>
          <TableHead className="w-[16%]">Company</TableHead>
          <TableHead className="w-[24%]">Contact</TableHead>
          <TableHead className="w-[10%]">Source</TableHead>
          <TableHead className="w-[16%]">Tags</TableHead>
          <TableHead className="w-[12%]">Added</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((client, index) => (
          <TableRow key={client.id}>
            <TableCell className="truncate font-medium">
              <Link
                href={clientPath(client.id)}
                {...{ [ROW_LINK_ATTRIBUTE]: index }}
                className="underline-offset-4 hover:underline"
              >
                {client.name}
              </Link>
            </TableCell>
            <TableCell className="truncate">{client.company ?? EMPTY}</TableCell>
            <TableCell>
              <Contact client={client} />
            </TableCell>
            <TableCell>{client.source === null ? EMPTY : sourceLabel(client.source)}</TableCell>
            <TableCell className="whitespace-normal">
              <ClientTagList tags={client.tags} max={VISIBLE_TAGS} />
            </TableCell>
            <TableCell>
              <LocalDate value={client.createdAt} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ClientCards({ items }: ClientListProps): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((client, index) => (
        <li key={client.id}>
          <Link
            href={clientPath(client.id)}
            {...{ [ROW_LINK_ATTRIBUTE]: index }}
            className="flex flex-col gap-1 rounded-lg border p-3 text-sm outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="font-medium break-words">{client.name}</span>
            {client.company !== null && (
              <span className="text-muted-foreground break-words">{client.company}</span>
            )}
            <Contact client={client} />
            <ClientTagList tags={client.tags} max={VISIBLE_TAGS} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Both layouts are rendered and CSS shows one, so the server HTML fits any width.
export function ClientList({ items }: ClientListProps): React.JSX.Element {
  return (
    <>
      <div className="hidden md:block">
        <ClientTable items={items} />
      </div>
      <div className="md:hidden">
        <ClientCards items={items} />
      </div>
    </>
  );
}
