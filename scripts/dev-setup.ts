import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));
const ENV_EXAMPLE = fileURLToPath(new URL('../.env.example', import.meta.url));
const KEYGEN = fileURLToPath(new URL('../apps/api/scripts/generate-jwt-keys.ts', import.meta.url));
const KEYGEN_COMMAND = 'pnpm --silent --filter @clientry/api jwt:keygen';
const KEY_NAMES = ['JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY'] as const;

class SetupError extends Error {
  override readonly name = 'SetupError';
}

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function keyLine(keys: string, name: string): string {
  const line = keys.split('\n').find((candidate) => candidate.startsWith(`${name}=`));
  if (line === undefined) {
    throw new SetupError(`The key generator printed no ${name} line`);
  }
  return line;
}

function createEnvFile(): void {
  const keys = execFileSync(process.execPath, [KEYGEN], { encoding: 'utf8' });
  let content = readFileSync(ENV_EXAMPLE, 'utf8');
  for (const name of KEY_NAMES) {
    const emptyLine = new RegExp(`^${name}=$`, 'm');
    if (!emptyLine.test(content)) {
      throw new SetupError(`.env.example has no empty ${name}= line to fill`);
    }
    const line = keyLine(keys, name);
    content = content.replace(emptyLine, () => line);
  }
  // wx: a file that appeared in the meantime is never overwritten.
  writeFileSync(ENV_FILE, content, { flag: 'wx' });
  say('Created .env from .env.example with a new key pair.');
}

function checkEnvFile(): void {
  const env = parseEnv(readFileSync(ENV_FILE, 'utf8'));
  const emptyKeys = KEY_NAMES.filter((name) => (env[name] ?? '') === '');
  if (emptyKeys.length > 0) {
    throw new SetupError(
      `Empty in .env: ${emptyKeys.join(', ')}. Replace the ${KEY_NAMES.join(' and ')} lines ` +
        `with the two that \`${KEYGEN_COMMAND}\` prints.`,
    );
  }
  say('Kept the existing .env.');
}

function run(command: string, hint: string): void {
  say(`> ${command}`);
  // Through a shell, which finds the Windows shims of pnpm and docker; the commands are fixed.
  const { status } = spawnSync(command, { cwd: ROOT, shell: true, stdio: 'inherit' });
  if (status !== 0) {
    throw new SetupError(`${command} failed. ${hint}`);
  }
}

function main(): void {
  if (existsSync(ENV_FILE)) {
    checkEnvFile();
  } else {
    createEnvFile();
  }
  run(
    'docker compose up -d --wait',
    'Is Docker running? A taken port: change POSTGRES_PORT or VALKEY_PORT in .env, and the port in DATABASE_URL or REDIS_URL with it.',
  );
  run(
    'pnpm --filter @clientry/api db:deploy',
    'Check that DATABASE_URL in .env points at the Postgres of docker compose.',
  );
  say('');
  say('Ready. Start the API and the web with `pnpm dev`, then open http://localhost:3000');
  say('and press "Explore the demo": the API builds the demo workspace when it first starts.');
}

try {
  main();
} catch (error) {
  if (!(error instanceof SetupError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
