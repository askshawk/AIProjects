import { hashPasscode } from "../src/lib/passcode";

/**
 * Prints the APP_PASSCODE_HASH value for a passcode, so the plain passcode
 * never has to live in an env file.
 *
 *   npm run passcode:hash -- "correct horse battery staple"
 */
async function main() {
  const passcode = process.argv[2];
  if (!passcode || passcode.length < 12) {
    console.error("Pass a passcode of at least 12 characters as the first argument.");
    process.exit(1);
  }
  console.log(await hashPasscode(passcode));
}

main();
