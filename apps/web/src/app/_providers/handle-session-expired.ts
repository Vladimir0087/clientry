import { logout } from '@/entities/session';
import { currentPathAndQuery, replaceLocation } from '@/shared/lib/navigation';
import { loginPath } from '@/shared/lib/redirect-target';

// After a refresh 200 and a second 401 the cookies still hold a valid JWT: without the logout
// the proxy would send /login straight back to this page. Its outcome does not matter.
export async function handleSessionExpired(): Promise<void> {
  await Promise.allSettled([logout()]);
  replaceLocation(loginPath(currentPathAndQuery()));
}
