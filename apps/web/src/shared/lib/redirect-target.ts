import type { Route } from 'next';

export const LOGIN_PATH = '/login';
export const REGISTER_PATH = '/register';
export const JOIN_PATH = '/join';
export const NEXT_PARAM = 'next';

const HOME_PATH = '/';
const AUTH_PATHS: ReadonlySet<string> = new Set([LOGIN_PATH, REGISTER_PATH]);
// Rendered in every session state: the page decides what a signed-in visitor sees.
const PUBLIC_PATHS: ReadonlySet<string> = new Set([JOIN_PATH]);

type AuthPath = typeof LOGIN_PATH | typeof REGISTER_PATH;

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.has(pathname);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

// Parsed, not prefix-checked: browsers read "//host", "/\host" and "/<tab>/host" as another origin.
// Typed as a route: any same-origin path is a valid target, and the gate decides what it renders.
export function resolveRedirectTarget(next: string | null | undefined, appOrigin: string): Route {
  if (next === null || next === undefined || !URL.canParse(next, appOrigin)) {
    return HOME_PATH;
  }
  const url = new URL(next, appOrigin);
  if (url.origin !== appOrigin || isAuthPath(url.pathname) || isPublicPath(url.pathname)) {
    return HOME_PATH;
  }
  return `${url.pathname}${url.search}${url.hash}` as Route;
}

export function loginPath(target: string): string {
  if (target === HOME_PATH) {
    return LOGIN_PATH;
  }
  return `${LOGIN_PATH}?${new URLSearchParams({ [NEXT_PARAM]: target }).toString()}`;
}

// Carries next as it came: every place that follows it resolves it first.
export function authPageHref(
  path: AuthPath,
  next: string | undefined,
): AuthPath | `${AuthPath}?${string}` {
  if (next === undefined || next === '') {
    return path;
  }
  return `${path}?${new URLSearchParams({ [NEXT_PARAM]: next }).toString()}`;
}
