import type { MemberRole } from './member-role.js';

export interface RecordActor {
  readonly userId: string;
  readonly role: MemberRole;
}

export function canDeleteRecord(actor: RecordActor, createdById: string): boolean {
  return actor.role === 'owner' || actor.userId === createdById;
}
