// Query strings may carry tokens or emails, so neither problem details nor logs keep them.
export function pathWithoutQuery(url: string): string {
  return url.split('?', 1)[0] ?? '';
}
