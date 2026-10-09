const LIKE_SPECIAL = /[\\%_]/g;

// Backslash is the default LIKE escape in Postgres, so the term matches literally.
export function escapeLikePattern(text: string): string {
  return text.replace(LIKE_SPECIAL, (char) => `\\${char}`);
}
