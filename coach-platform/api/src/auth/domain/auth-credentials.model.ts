/**
 * A user's password credential. Lives in its own collection (auth-owned),
 * never on the user profile. The plaintext password is never stored or modeled —
 * only the hash and the algorithm that produced it (so we can migrate later).
 */
export interface AuthCredentials {
  userId: string;
  passwordHash: string;
  algo: string; // e.g. "argon2id"
}
