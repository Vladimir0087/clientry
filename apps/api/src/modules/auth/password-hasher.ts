import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { hash, hashSync, verify } from '@node-rs/argon2';
import type { Options } from '@node-rs/argon2';

// OWASP baseline; argon2id is the library default, its Algorithm const enum is unreadable under
// isolatedModules. The parameters are stored in each hash, so they can be raised later.
const HASH_OPTIONS: Options = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

// The same password typed on two systems can arrive as different code points.
function normalize(password: string): string {
  return password.normalize('NFKC');
}

@Injectable()
export class PasswordHasher {
  // Computed once at startup, so an unknown-email login never pays for a hash on top of a verify.
  private readonly dummyHash = hashSync(randomBytes(32).toString('base64url'), HASH_OPTIONS);

  hash(password: string): Promise<string> {
    return hash(normalize(password), HASH_OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, normalize(password));
  }

  // Spends the same time as a real check, so timing does not reveal an unknown email.
  async verifyDummy(password: string): Promise<void> {
    await verify(this.dummyHash, normalize(password));
  }
}
