import { useMembers } from '@/entities/member';
import { useSession } from '@/entities/session';
import type { MemberFilter } from '@clientry/shared/workspaces';

// Whose records an empty list was filtered to. No name for a former member, and also while the
// members load or after they fail, so the text then names nobody.
export type FilterSubject =
  | { readonly kind: 'anyone' }
  | { readonly kind: 'me' }
  | { readonly kind: 'member'; readonly name: string | null };

// Usually reads the members the page prefetched; asks for them when a failed prefetch left none,
// so a current member is not taken for a former one.
export function useFilterSubject(filter: MemberFilter | null): FilterSubject {
  const session = useSession();
  const isMe = filter === 'me' || filter === session.data?.user.id;
  const members = useMembers({ enabled: filter !== null && !isMe });
  if (filter === null) {
    return { kind: 'anyone' };
  }
  if (isMe) {
    return { kind: 'me' };
  }
  const member = members.data?.items.find(({ id }) => id === filter);
  return { kind: 'member', name: member?.name ?? null };
}
