// A full page load drops the router cache, the query cache and every other in-memory state.
export function replaceLocation(url: string): void {
  window.location.replace(url);
}

export function currentPathAndQuery(): string {
  return `${window.location.pathname}${window.location.search}`;
}
