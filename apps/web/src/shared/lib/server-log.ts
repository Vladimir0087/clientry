import 'server-only';

// pino's numeric levels, so the web and the API logs read alike.
const LEVELS = { info: 30, warn: 40, error: 50 } as const;

export type ServerLogLevel = keyof typeof LEVELS;

// level, time and msg belong to the entry; a field must not overwrite them.
export type ServerLogFields = Readonly<Record<string, string | number | undefined>> & {
  readonly level?: never;
  readonly time?: never;
  readonly msg?: never;
};

// One JSON line per event on stdout, which Netlify keeps as function logs.
export function writeServerLog(
  level: ServerLogLevel,
  msg: string,
  fields: ServerLogFields = {},
): void {
  const entry = { level: LEVELS[level], time: Date.now(), msg, ...fields };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}
