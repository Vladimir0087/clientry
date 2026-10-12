import { Redis } from 'ioredis';

// Queue keys outlive an app, so every test that reads them starts from an empty Valkey.
export async function flushValkey(redisUrl: string): Promise<void> {
  const client = new Redis(redisUrl);
  try {
    await client.flushall();
  } finally {
    await client.quit();
  }
}
