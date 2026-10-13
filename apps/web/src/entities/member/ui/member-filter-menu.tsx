'use client';

import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import type * as React from 'react';

import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Spinner } from '@/shared/ui/spinner';
import type { Member, MemberFilter } from '@clientry/shared/workspaces';

import { ANYONE } from '../model/member-filter-parsers';
import { useMembers } from '../model/use-members';

const ME_VALUE = 'me';
const FORMER_VALUE = 'former';

interface MemberFilterMenuProps {
  readonly label: string;
  // Null for anyone.
  readonly value: MemberFilter | null;
  // Not imported from the session: entities do not import each other.
  readonly currentUserId: string | undefined;
  readonly onChange: (value: MemberFilter | null) => void;
  readonly ref?: React.Ref<HTMLButtonElement>;
}

// The caller's own id means the same records as "me", so a shared link reads the same.
function radioValue(value: MemberFilter | null, currentUserId: string | undefined): string {
  if (value === null) {
    return ANYONE;
  }
  return value === currentUserId ? ME_VALUE : value;
}

function others(
  members: readonly Member[] | undefined,
  currentUserId: string | undefined,
): Member[] {
  return (members ?? [])
    .filter(({ id }) => id !== currentUserId)
    .toSorted((first, second) => first.name.localeCompare(second.name));
}

function isFormerMember(checked: string, members: readonly Member[] | undefined): boolean {
  return (
    members !== undefined &&
    checked !== ANYONE &&
    checked !== ME_VALUE &&
    !members.some(({ id }) => id === checked)
  );
}

// Null while the members are not loaded, so the trigger shows the label alone.
function choiceName(checked: string, members: readonly Member[] | undefined): string | null {
  if (checked === ANYONE) {
    return 'Anyone';
  }
  if (checked === ME_VALUE) {
    return 'Me';
  }
  if (isFormerMember(checked, members)) {
    return 'Former member';
  }
  return members?.find(({ id }) => id === checked)?.name ?? null;
}

interface MembersNoticeProps {
  readonly isError: boolean;
  readonly onRetry: () => void;
}

// One live region for both lines, so the switch from loading to the failure is read out. No status
// role: a menu may hold only its items and groups.
function MembersNotice({ isError, onRetry }: MembersNoticeProps): React.JSX.Element {
  // Keeps the menu open, so the retried list appears in place.
  const handleSelect = (event: Event): void => {
    event.preventDefault();
    onRetry();
  };
  return (
    <>
      <div aria-live="polite" data-testid="members-notice">
        <DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground">
          {isError ? (
            'Could not load members'
          ) : (
            <>
              <Spinner aria-hidden="true" />
              Loading members…
            </>
          )}
        </DropdownMenuLabel>
      </div>
      {isError && <DropdownMenuItem onSelect={handleSelect}>Try again</DropdownMenuItem>}
    </>
  );
}

// Members load when the menu first opens; a page with a member in its URL prefetches them.
export function MemberFilterMenu({
  label,
  value,
  currentUserId,
  onChange,
  ref,
}: MemberFilterMenuProps): React.JSX.Element {
  const [hasOpened, setHasOpened] = useState(false);
  const members = useMembers({ enabled: hasOpened });
  const list = members.data?.items;
  const checked = radioValue(value, currentUserId);
  const name = choiceName(checked, list);
  const isFormer = isFormerMember(checked, list);
  const handleOpenChange = (isOpen: boolean): void => {
    if (isOpen) {
      setHasOpened(true);
    }
  };
  const handleChange = (next: string): void => {
    if (next === ANYONE) {
      onChange(null);
    } else if (next !== FORMER_VALUE) {
      onChange(next === ME_VALUE ? 'me' : next);
    }
  };
  const handleRetry = (): void => {
    void members.refetch();
  };
  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button ref={ref} variant="outline" className="max-w-full">
          <span className="truncate">{name === null ? label : `${label}: ${name}`}</span>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      {/* As wide as the names need, so similar names stay apart; the trigger is often narrower. */}
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-auto max-w-80 min-w-(--radix-dropdown-menu-trigger-width) overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          value={isFormer ? FORMER_VALUE : checked}
          onValueChange={handleChange}
        >
          <DropdownMenuRadioItem value={ANYONE}>Anyone</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value={ME_VALUE}>Me</DropdownMenuRadioItem>
          {others(list, currentUserId).map((member) => (
            <DropdownMenuRadioItem key={member.id} value={member.id}>
              <span className="truncate">{member.name}</span>
            </DropdownMenuRadioItem>
          ))}
          {isFormer && (
            <DropdownMenuRadioItem value={FORMER_VALUE}>Former member</DropdownMenuRadioItem>
          )}
        </DropdownMenuRadioGroup>
        {list === undefined && <MembersNotice isError={members.isError} onRetry={handleRetry} />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
