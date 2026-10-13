import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api/api-error';

import { moveErrorMessage } from './use-move-deal';

describe('moveErrorMessage', () => {
  it.each([
    [
      'the deal changed elsewhere',
      new ApiError({ status: 409, code: 'DEAL_CHANGED' }),
      'This deal was changed by someone else. The board is updated.',
    ],
    [
      'the board changed elsewhere',
      new ApiError({ status: 409, code: 'BOARD_CHANGED' }),
      'The board changed. Try again.',
    ],
    [
      'the deal is gone',
      new ApiError({ status: 404, code: 'DEAL_NOT_FOUND' }),
      'This deal no longer exists.',
    ],
    [
      'the assignee of a reopened deal is no longer a member',
      new ApiError({
        status: 400,
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'assigneeId', message: 'Choose a member' }],
      }),
      'The assignee is no longer in the workspace. Choose another one to reopen this deal.',
    ],
    ['the request fails otherwise', new Error('offline'), 'Could not move the deal. Try again.'],
  ])('should explain the failure on the board when %s', (_case, error, message) => {
    expect(moveErrorMessage(error, 'board')).toBe(message);
  });

  it('should say the page is updated when the deal changed elsewhere during a move from its page', () => {
    const error = new ApiError({ status: 409, code: 'DEAL_CHANGED' });

    expect(moveErrorMessage(error, 'page')).toBe(
      'This deal was changed by someone else. The page is updated.',
    );
  });
});
