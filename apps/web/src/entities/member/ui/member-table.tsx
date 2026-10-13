import type * as React from 'react';

import { roleLabel } from '@/shared/lib/role-label';
import { Badge } from '@/shared/ui/badge';
import { LocalDate } from '@/shared/ui/local-date';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import type { Member } from '@clientry/shared/workspaces';

interface MemberTableProps {
  readonly members: readonly Member[];
  // Not imported from the session: entities do not import each other.
  readonly currentUserId: string | undefined;
  // Filled by the app with the row actions; no actions column without it.
  readonly renderActions?: (member: Member) => React.ReactNode;
}

interface MemberNameProps {
  readonly member: Member;
  readonly isYou: boolean;
}

function MemberName({ member, isYou }: MemberNameProps): React.JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-2 md:max-w-64">
      <span className="truncate font-medium">{member.name}</span>
      {isYou && <Badge variant="secondary">You</Badge>}
    </span>
  );
}

interface EmailLinkProps {
  readonly email: string;
}

function EmailLink({ email }: EmailLinkProps): React.JSX.Element {
  return (
    <a
      href={`mailto:${email}`}
      className="block truncate text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 md:max-w-64"
    >
      {email}
    </a>
  );
}

// From md a table, below it cards with the same content; CSS hides the other one.
export function MemberTable({
  members,
  currentUserId,
  renderActions,
}: MemberTableProps): React.JSX.Element {
  const hasActions = renderActions !== undefined;
  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              {hasActions && (
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <MemberName member={member} isYou={member.id === currentUserId} />
                </TableCell>
                <TableCell>
                  <EmailLink email={member.email} />
                </TableCell>
                <TableCell>{roleLabel(member.role)}</TableCell>
                <TableCell>
                  <LocalDate value={member.joinedAt} />
                </TableCell>
                {hasActions && (
                  <TableCell className="text-right">{renderActions(member)}</TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {members.map((member) => (
          <li key={member.id} className="flex items-start gap-3 rounded-lg border p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <MemberName member={member} isYou={member.id === currentUserId} />
              <EmailLink email={member.email} />
              <span>
                {roleLabel(member.role)} · Joined <LocalDate value={member.joinedAt} />
              </span>
            </div>
            {hasActions && renderActions(member)}
          </li>
        ))}
      </ul>
    </>
  );
}
