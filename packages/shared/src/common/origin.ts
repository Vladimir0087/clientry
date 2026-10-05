const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

// URL normalizes away a bare "?" or "#", so the raw string is checked for them.
export function parseOrigin(value: string): string | undefined {
  if (!URL.canParse(value)) {
    return undefined;
  }
  const url = new URL(value);
  const isBareOrigin =
    HTTP_PROTOCOLS.has(url.protocol) &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '' &&
    url.username === '' &&
    url.password === '' &&
    !value.endsWith('?') &&
    !value.endsWith('#');
  return isBareOrigin ? url.origin : undefined;
}
