import { SIGNING_KEY_VARIABLE } from './support/access-token.js';
import { startStack } from './support/stack.js';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const stack = await startStack();
  // Workers start after global setup and inherit its environment.
  process.env[SIGNING_KEY_VARIABLE] = stack.signingKey;
  return stack.stop;
}
