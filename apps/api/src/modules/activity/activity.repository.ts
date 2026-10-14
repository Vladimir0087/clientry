import type { ActivityEntry } from '@clientry/shared/activity';

import type { CreatedAtCursor } from '../../common/pagination/created-at-cursor.js';

export interface ActivityPageRequest {
  readonly after: CreatedAtCursor | null;
  readonly limit: number;
}

export interface ActivityPage {
  readonly items: readonly ActivityEntry[];
  readonly hasMore: boolean;
}

export abstract class ActivityRepository {
  // Newest first, entries of deleted and hidden subjects included; throws when a stored entry
  // does not match activityEntrySchema.
  abstract feed(workspaceId: string, page: ActivityPageRequest): Promise<ActivityPage>;
}
