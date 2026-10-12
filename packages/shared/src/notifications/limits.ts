export const NOTIFICATION_LIMITS = {
  cursor: 2048,
  defaultPageSize: 20,
  maxPageSize: 50,
  // The unread count stops here; the bell shows "99+" above 99.
  unreadCountCap: 100,
} as const;
