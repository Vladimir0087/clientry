const DAY_MS = 24 * 60 * 60 * 1000;

export const INVITE_LIMITS = {
  lifetimeMs: 7 * DAY_MS,
  pending: 20,
} as const;
