import { Injectable } from '@nestjs/common';

import type { MemberListResponse } from '@clientry/shared/workspaces';

import { MembersRepository } from './members.repository.js';
import type { AuthUser } from '../../common/auth/auth-user.js';

@Injectable()
export class MembersService {
  constructor(private readonly members: MembersRepository) {}

  async list(user: AuthUser): Promise<MemberListResponse> {
    return { items: await this.members.list(user.workspaceId) };
  }
}
