import * as argon2 from 'argon2';

/** Explicit argon2id parameters (OWASP-aligned baseline for Nest API). */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { ...ARGON2_OPTIONS });
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  return argon2.verify(hash, plain);
}
