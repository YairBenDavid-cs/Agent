import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordHasherPort } from '../domain/password-hasher.port';

/**
 * argon2id hasher (OWASP's first choice). A precomputed dummy hash backs
 * dummyVerify so a missing user costs the same time as a wrong password.
 */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasherPort {
  readonly algo = 'argon2id';
  private readonly options: argon2.Options = { type: argon2.argon2id };
  private dummyHash?: Promise<string>;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Malformed/foreign hash -> treat as non-match, never throw to caller.
      return false;
    }
  }

  async dummyVerify(plain: string): Promise<void> {
    if (!this.dummyHash) {
      this.dummyHash = argon2.hash('dummy-password-for-timing', this.options);
    }
    await this.verify(await this.dummyHash, plain);
  }
}
