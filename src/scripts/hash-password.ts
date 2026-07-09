import bcrypt from "bcryptjs";

/**
 * Generate a bcrypt hash for the shared team password.
 * Run: `npm run auth:hash -- "your-team-password"`
 *
 * IMPORTANT: a bcrypt hash contains `$` signs, which Next.js's .env loader (dotenv-expand)
 * silently mangles as variable interpolation. So we print a base64 form — paste the
 * SHARED_LOGIN_PASSWORD_HASH_B64 line into .env exactly as shown. No `$`, nothing to escape.
 */
const password = process.argv[2];
if (!password) {
  console.error('usage: npm run auth:hash -- "your-team-password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const b64 = Buffer.from(hash, "utf8").toString("base64");

console.log("");
console.log("bcrypt hash:            " + hash);
console.log("");
console.log("Paste THIS line into .env (base64 — safe from dotenv's $ mangling):");
console.log("");
console.log("SHARED_LOGIN_PASSWORD_HASH_B64=" + b64);
console.log("");
