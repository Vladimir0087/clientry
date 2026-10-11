import type { Member } from '@clientry/shared/workspaces';

export abstract class MembersRepository {
  // In join order: membership created_at, then id.
  abstract list(workspaceId: string): Promise<Member[]>;
}
