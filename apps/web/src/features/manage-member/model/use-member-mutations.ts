import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { dealKeys } from '@/entities/deal';
import { inviteKeys } from '@/entities/invite';
import { changeMemberRole, memberKeys, removeMember } from '@/entities/member';
import { sessionKeys } from '@/entities/session';
import { taskKeys } from '@/entities/task';
import { hasPermission } from '@clientry/shared/auth';
import type { MemberRole } from '@clientry/shared/auth';
import type { Member } from '@clientry/shared/workspaces';

interface RoleVariables {
  readonly id: string;
  readonly role: MemberRole;
}

interface RemoveVariables {
  readonly id: string;
  readonly transferTo: string;
}

// The caller's own role is read from the session, so a change of it refetches the session too.
// A demotion revokes the member's pending invites.
export function useChangeRole(
  currentUserId: string | undefined,
): UseMutationResult<Member, Error, RoleVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: RoleVariables) => changeMemberRole(id, role),
    onSuccess: (_member, { id, role }) => {
      const isSelf = id === currentUserId;
      void queryClient.invalidateQueries({ queryKey: memberKeys.all });
      if (!hasPermission(role, 'team.manage')) {
        // A caller who just lost team.manage would get a 403 from a refetch of the list.
        void queryClient.invalidateQueries({
          queryKey: inviteKeys.all,
          refetchType: isSelf ? 'none' : 'active',
        });
      }
      if (isSelf) {
        void queryClient.invalidateQueries({ queryKey: sessionKeys.current });
      }
    },
  });
}

// The removed member's invites are revoked and their open deals and tasks change assignee.
export function useRemoveMember(): UseMutationResult<void, Error, RemoveVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, transferTo }: RemoveVariables) => removeMember(id, transferTo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.all });
      void queryClient.invalidateQueries({ queryKey: inviteKeys.all });
      void queryClient.invalidateQueries({ queryKey: dealKeys.all });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
