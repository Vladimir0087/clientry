import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// The root .env also holds the API's secrets; only the web variables enter this process.
const WEB_VARIABLES = ['API_URL', 'JWT_PUBLIC_KEY'] as const;

function readEnvFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export function loadRootEnv(
  path: string,
  target: Record<string, string | undefined> = process.env,
): void {
  const content = readEnvFile(path);
  if (content === undefined) {
    return;
  }
  const parsed = parseEnv(content);
  for (const name of WEB_VARIABLES) {
    const value = parsed[name];
    if (target[name] === undefined && value !== undefined) {
      target[name] = value;
    }
  }
}
