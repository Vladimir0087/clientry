import type { MemberRole } from '@clientry/shared/auth';

const ROLE_LABELS: Readonly<Record<MemberRole, string>> = {
  owner: 'Owner',
  manager: 'Manager',
};

export function roleLabel(role: MemberRole): string {
  return ROLE_LABELS[role];
}
