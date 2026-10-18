import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Checking the sign-in passcode. Two ways to configure it:
 * - APP_PASSCODE: the passcode itself, as a Vercel setting. Simplest; the
 *   only place it's readable is your own Vercel settings.
 * - APP_PASSCODE_HASH: a scrypt hash (`npm run passcode:hash`), for anyone
 *   who'd rather not store the passcode anywhere. scrypt is slow and
 *   memory-hard on purpose, so a leaked hash is expensive to brute-force.
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

const digest = (text: string) => createHash("sha256").update(text).digest();

type PasscodeEnv = { APP_PASSCODE?: string; APP_PASSCODE_HASH?: string };

export function passcodeConfigured(env: PasscodeEnv = process.env as PasscodeEnv): boolean {
  return Boolean(env.APP_PASSCODE || env.APP_PASSCODE_HASH);
}

export async function checkPasscode(input: string, env: PasscodeEnv = process.env as PasscodeEnv): Promise<boolean> {
  if (env.APP_PASSCODE) {
    // Compare fixed-length digests so the comparison is constant-time.
    return timingSafeEqual(digest(input), digest(env.APP_PASSCODE));
  }
  if (env.APP_PASSCODE_HASH) return verifyPasscode(input, env.APP_PASSCODE_HASH);
  return false;
}
