import type { ActivityEvent } from '@clientry/shared/activity';
import type { MemberRole } from '@clientry/shared/auth';
import type { ClientSource } from '@clientry/shared/clients';
import type { Currency, StageKind } from '@clientry/shared/deals';
import type { NotificationEvent } from '@clientry/shared/notifications';

export interface DemoWorkspaceRow {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
}

export interface DemoUserRow {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly createdAt: Date;
}

export interface DemoMembershipRow {
  readonly id: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: MemberRole;
  readonly createdAt: Date;
}

export interface DemoStageRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly position: number;
  readonly kind: StageKind;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DemoClientRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly createdById: string;
  readonly name: string;
  readonly company: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly source: ClientSource | null;
  readonly notes: string | null;
  readonly tags: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DemoDealRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly clientId: string;
  readonly stageId: string;
  readonly assigneeId: string;
  readonly createdById: string;
  readonly title: string;
  // Minor units.
  readonly amount: number;
  readonly currency: Currency;
  readonly position: string;
  readonly version: number;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DemoTaskRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly createdById: string;
  readonly assigneeId: string;
  readonly clientId: string | null;
  readonly dealId: string | null;
  readonly title: string;
  readonly dueAt: Date;
  readonly remindAt: Date | null;
  readonly reminderSentAt: Date | null;
  readonly doneAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DemoActivityRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly dealId: string | null;
  readonly clientId: string | null;
  readonly taskId: string | null;
  readonly type: ActivityEvent['type'];
  readonly payload: ActivityEvent['payload'];
  readonly createdAt: Date;
}

export interface DemoNotificationRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly taskId: string;
  readonly type: NotificationEvent['type'];
  readonly payload: NotificationEvent['payload'];
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

// Every row of the demo; the workspace, users and memberships are written only when missing.
export interface DemoWorkspace {
  readonly workspace: DemoWorkspaceRow;
  readonly users: readonly DemoUserRow[];
  readonly memberships: readonly DemoMembershipRow[];
  readonly stages: readonly DemoStageRow[];
  readonly clients: readonly DemoClientRow[];
  readonly deals: readonly DemoDealRow[];
  readonly tasks: readonly DemoTaskRow[];
  readonly activities: readonly DemoActivityRow[];
  readonly notifications: readonly DemoNotificationRow[];
}
