import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { ValkeyContainer } from '@testcontainers/valkey';
import type { StartedValkeyContainer } from '@testcontainers/valkey';

import { API_ORIGIN, API_PORT, WEB_ORIGIN, WEB_PORT } from './origins.js';
import { visitorHeaders } from './visitor-address.js';

// The images of compose.yaml and of the API's integration tests.
const POSTGRES_IMAGE = 'postgres:18';
const VALKEY_IMAGE = 'valkey/valkey:8.1';

const API_ROOT = fileURLToPath(new URL('../../api/', import.meta.url));
const WEB_ROOT = fileURLToPath(new URL('../../web/', import.meta.url));
const LOG_DIR = fileURLToPath(new URL('../.logs/', import.meta.url));
const PRISMA_CLI = fileURLToPath(
  new URL('../../api/node_modules/prisma/build/index.js', import.meta.url),
);
const NEXT_CLI = fileURLToPath(
  new URL('../../web/node_modules/next/dist/bin/next', import.meta.url),
);

const POLL_INTERVAL_MS = 250;
const SERVER_TIMEOUT_MS = 60_000;
// The demo build is the API's first recurring tick, which runs at bootstrap.
const DEMO_TIMEOUT_MS = 120_000;

interface Containers {
  readonly postgres: StartedPostgreSqlContainer;
  readonly valkey: StartedValkeyContainer;
}

interface SigningKeys {
  readonly privateKey: string;
  readonly publicKey: string;
}

class StackStartError extends Error {
  override readonly name = 'StackStartError';
}

function isPortTaken(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      resolve(false);
    });
  });
}

async function assertPortsFree(): Promise<void> {
  for (const port of [WEB_PORT, API_PORT]) {
    const taken = await Promise.all(['127.0.0.1', '::1'].map((host) => isPortTaken(port, host)));
    if (taken.includes(true)) {
      throw new StackStartError(
        `Port ${String(port)} is busy: stop whatever listens on it (pnpm dev?) and run again`,
      );
    }
  }
}

async function startContainers(): Promise<Containers> {
  const [postgres, valkey] = await Promise.all([
    // Neon's locale, as in the API's integration tests.
    new PostgreSqlContainer(POSTGRES_IMAGE)
      .withEnvironment({ POSTGRES_INITDB_ARGS: '--locale=C.UTF-8' })
      .start(),
    new ValkeyContainer(VALKEY_IMAGE).start(),
  ]);
  return { postgres, valkey };
}

function databaseUrl({ postgres }: Containers): string {
  return postgres.getConnectionUri().replace(/^postgres:/, 'postgresql:');
}

function generateSigningKeys(): SigningKeys {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
}

function run(
  name: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): ChildProcess {
  mkdirSync(LOG_DIR, { recursive: true });
  const log = openSync(`${LOG_DIR}${name}.log`, 'w');
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', log, log] });
  // The child holds its own copy of the descriptor.
  closeSync(log);
  return child;
}

type ExitStatus = number | NodeJS.Signals | null;

// A process ended by a signal keeps exitCode null and sets signalCode instead.
function exitStatus(child: ChildProcess): ExitStatus {
  return child.exitCode ?? child.signalCode;
}

function waitForExit(child: ChildProcess): Promise<ExitStatus> {
  const status = exitStatus(child);
  if (status !== null) {
    return Promise.resolve(status);
  }
  return new Promise((resolve) => {
    child.once('exit', () => {
      resolve(exitStatus(child));
    });
  });
}

async function migrate(url: string): Promise<void> {
  const child = run('migrate', [PRISMA_CLI, 'migrate', 'deploy'], API_ROOT, {
    ...process.env,
    DATABASE_URL: url,
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
  });
  const status = await waitForExit(child);
  if (status !== 0) {
    throw new StackStartError(
      `prisma migrate deploy exited with ${String(status)}, see .logs/migrate.log`,
    );
  }
}

function startApi(containers: Containers, keys: SigningKeys): ChildProcess {
  return run('api', ['dist/main.js'], API_ROOT, {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(API_PORT),
    LOG_LEVEL: 'info',
    DATABASE_URL: databaseUrl(containers),
    REDIS_URL: containers.valkey.getConnectionUrl(),
    JWT_PRIVATE_KEY: keys.privateKey,
    TRUSTED_ORIGINS: WEB_ORIGIN,
    // Next's rewrite is the one proxy in front of the API; it passes X-Forwarded-For unchanged.
    TRUST_PROXY_HOPS: '1',
    APP_VERSION: 'e2e',
  });
}

function startWeb(keys: SigningKeys): ChildProcess {
  return run('web', [NEXT_CLI, 'start', '--port', String(WEB_PORT)], WEB_ROOT, {
    ...process.env,
    NODE_ENV: 'production',
    API_URL: API_ORIGIN,
    JWT_PUBLIC_KEY: keys.publicKey,
  });
}

// fetch rejects with "fetch failed" and keeps the reason, such as ECONNREFUSED, in its cause.
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const { cause } = error;
  return cause instanceof Error ? `${error.message}: ${cause.message}` : error.message;
}

async function poll(
  description: string,
  timeoutMs: number,
  child: ChildProcess,
  attempt: () => Promise<Response>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastOutcome = 'made no attempt';
  while (Date.now() < deadline) {
    const status = exitStatus(child);
    if (status !== null) {
      throw new StackStartError(`${description}: the process exited with ${String(status)}`);
    }
    try {
      const response = await attempt();
      if (response.ok) {
        return;
      }
      lastOutcome = `answered ${String(response.status)}`;
    } catch (error) {
      lastOutcome = `failed: ${describeFailure(error)}`;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new StackStartError(
    `${description}: not ready in ${String(timeoutMs / 1000)} s, the last attempt ${lastOutcome}`,
  );
}

function request(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, redirect: 'manual' });
}

// Each attempt is a new visitor: the demo route allows 10 calls a minute per address.
function startDemoSession(): Promise<Response> {
  return request(`${WEB_ORIGIN}/api/auth/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB_ORIGIN, ...visitorHeaders() },
    body: JSON.stringify({ role: 'owner' }),
  });
}

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (child === undefined) {
    return;
  }
  if (exitStatus(child) !== null) {
    return;
  }
  child.kill();
  await waitForExit(child);
}

export interface Stack {
  // The run's signing key, for tests that need a token the API never issues.
  readonly signingKey: string;
  readonly stop: () => Promise<void>;
}

export async function startStack(): Promise<Stack> {
  await assertPortsFree();
  const containers = await startContainers();
  let api: ChildProcess | undefined;
  let web: ChildProcess | undefined;
  const stopAll = async (): Promise<void> => {
    await stop(web);
    await stop(api);
    await Promise.all([containers.postgres.stop(), containers.valkey.stop()]);
  };
  const keys = generateSigningKeys();
  try {
    await migrate(databaseUrl(containers));
    const startedApi = startApi(containers, keys);
    api = startedApi;
    await poll('API', SERVER_TIMEOUT_MS, startedApi, () => request(`${API_ORIGIN}/health/ready`));
    const startedWeb = startWeb(keys);
    web = startedWeb;
    await poll('Web', SERVER_TIMEOUT_MS, startedWeb, () => request(`${WEB_ORIGIN}/login`));
    await poll('Demo', DEMO_TIMEOUT_MS, startedApi, startDemoSession);
  } catch (error) {
    await stopAll();
    throw error;
  }
  return { signingKey: keys.privateKey, stop: stopAll };
}
