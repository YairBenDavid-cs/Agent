export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasherPort {
  /** The algorithm tag stored alongside the hash (e.g. "argon2id"). */
  readonly algo: string;
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
  /**
   * Verify against a throwaway hash to equalize timing when no user/credential
   * exists, defeating account-enumeration via response latency.
   */
  dummyVerify(plain: string): Promise<void>;
}
