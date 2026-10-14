import { Injectable } from '@nestjs/common';

import type { ActivityFeedQuery, ActivityFeedResponse } from '@clientry/shared/activity';

import { ActivityRepository } from './activity.repository.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { RequestValidationError } from '../../common/errors/request-validation.error.js';
import {
  decodeCreatedAtCursor,
  encodeCreatedAtCursor,
} from '../../common/pagination/created-at-cursor.js';
import type { CreatedAtCursor } from '../../common/pagination/created-at-cursor.js';

function decodeCursor(raw: string | undefined): CreatedAtCursor | null {
  if (raw === undefined) {
    return null;
  }
  const cursor = decodeCreatedAtCursor(raw);
  if (!cursor) {
    throw new RequestValidationError([{ path: 'cursor', message: 'Invalid cursor' }]);
  }
  return cursor;
}

// Every member reads the feed of the whole workspace.
@Injectable()
export class ActivityService {
  constructor(private readonly activity: ActivityRepository) {}

  async feed(user: AuthUser, query: ActivityFeedQuery): Promise<ActivityFeedResponse> {
    const page = await this.activity.feed(user.workspaceId, {
      after: decodeCursor(query.cursor),
      limit: query.limit,
    });
    const last = page.items.at(-1);
    return {
      items: [...page.items],
      nextCursor:
        page.hasMore && last
          ? encodeCreatedAtCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }
}
