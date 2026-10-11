import type { DealsTransaction } from './deals.repository.js';
import { DealChangedError, DealNotFoundError } from './errors.js';

// A conditional write matched no row: the deal is either gone or at another version.
export async function staleDealError(
  deals: DealsTransaction,
  workspaceId: string,
  id: string,
): Promise<DealChangedError | DealNotFoundError> {
  const deal = await deals.findById(workspaceId, id);
  return deal ? new DealChangedError() : new DealNotFoundError();
}
