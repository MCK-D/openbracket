import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 32;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelism: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N: cost, r: blockSize, p: parallelism, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

/** Hashes with scrypt and a random 16-byte salt: `scrypt$N$r$p$salt$key` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  )
    throw new Error(
      `Passwords must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
    );
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM);
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/** Constant-time check. Malformed or unsupported hashes never verify. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, cost, blockSize, parallelism, salt, key] = stored.split("$");
  const params = [cost, blockSize, parallelism].map(Number);
  if (
    scheme !== "scrypt" ||
    !salt ||
    !key ||
    params.some((value) => !Number.isSafeInteger(value) || value < 1) ||
    params[0] !== COST ||
    params[1] !== BLOCK_SIZE ||
    params[2] !== PARALLELISM ||
    password.length > PASSWORD_MAX_LENGTH
  )
    return false;
  const expected = Buffer.from(key, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await derive(
    password,
    Buffer.from(salt, "base64url"),
    COST,
    BLOCK_SIZE,
    PARALLELISM,
  );
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;
/** Spends the same work as a real check when an account has no password, so timing does not reveal accounts. */
export async function rejectUnknownAccount(password: string): Promise<false> {
  dummyHash ??= hashPassword("unknown-account-placeholder");
  await verifyPassword(password, await dummyHash);
  return false;
}
