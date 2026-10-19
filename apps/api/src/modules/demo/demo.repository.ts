import type { DemoWorkspace } from './demo-rows.js';

// Scoped by the demo's own fixed workspace rather than a caller's: no request ever reaches it.
export abstract class DemoRepository {
  // One transaction: the demo's records are replaced by these rows; the workspace, users and
  // memberships are kept and only created when missing. unusableHash runs once per new user.
  abstract replace(demo: DemoWorkspace, unusableHash: () => Promise<string>): Promise<void>;
}
