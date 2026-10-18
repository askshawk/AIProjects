import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Passcode hashing with Node's scrypt, the same parameters iron-atlas uses.
 * scrypt is slow and memory-hard on purpose, so a leaked hash is expensive to
 * brute-force. Only the hash lives in the environment, never the passcode.
 */

function scryptAsync(secret: string, salt: string, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, keylen, options, (err, derived) => (err ? reject(err) : resolve(derived)));
  });
}

const SCRYPT_OPTIONS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;

export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(passcode, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPasscode(passcode: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const derived = await scryptAsync(passcode, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  // Constant-time: a length-dependent early return would leak information.
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}
