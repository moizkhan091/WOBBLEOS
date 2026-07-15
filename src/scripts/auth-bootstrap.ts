import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { founderProfiles } from "@/db/schema";
import { BCRYPT_ROUNDS, MIN_PASSWORD_LENGTH, normalizeEmail, revokeFounderSessions, validatePasswordStrength } from "@/lib/auth";

/**
 * Founder account bootstrap.
 *
 * Founder credentials live in Postgres, never in the environment or in this repository. This CLI is the
 * only way they get set. It deliberately supports two very different jobs:
 *
 *   --seed-test   create four SYNTHETIC founders with generated passwords, printed once, for local UAT.
 *                 Refuses to run against NODE_ENV=production.
 *   --founder …   set/rotate ONE real founder's email + password, reading the password from stdin or
 *                 WOBBLE_BOOTSTRAP_PASSWORD so it never lands in shell history or a process list.
 *
 * Usage:
 *   npm run auth:bootstrap -- --list
 *   npm run auth:bootstrap -- --seed-test
 *   npm run auth:bootstrap -- --founder founder_moiz --email moiz@example.com --super-admin
 *   npm run auth:bootstrap -- --founder founder_ali --disable
 *   npm run auth:bootstrap -- --founder founder_ali --enable
 */

function loadEnvFile(path = resolve(process.cwd(), ".env")) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    if (!process.env[match[1].trim()]) process.env[match[1].trim()] = match[2];
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : "";
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** A generated password for synthetic test accounts. Base64url of 18 random bytes ⇒ 24 chars. */
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

/** Read a password without echoing it into argv/history. Falls back to the env var for CI. */
async function readSecret(prompt: string): Promise<string> {
  const fromEnv = process.env.WOBBLE_BOOTSTRAP_PASSWORD;
  if (fromEnv) return fromEnv;
  process.stdout.write(prompt);
  return new Promise((resolvePw) => {
    const stdin = process.stdin;
    stdin.setEncoding("utf8");
    let buf = "";
    // Raw mode so the password is not echoed to the terminal / screen-share / screenshot.
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\n" || ch === "\r" || ch === "") {
          if (stdin.isTTY) stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write("\n");
          resolvePw(buf);
          return;
        }
        if (ch === "") process.exit(130); // Ctrl-C
        buf += ch;
      }
    });
  });
}

/** The four synthetic founders used for local UAT. Emails are .local — never a real mailbox. */
const TEST_FOUNDERS = [
  { id: "founder_moiz", email: "moiz@wobble.local", superAdmin: true },
  { id: "founder_ali", email: "ali@wobble.local", superAdmin: false },
  { id: "founder_ibrahim", email: "ibrahim@wobble.local", superAdmin: false },
  { id: "founder_haad", email: "haad@wobble.local", superAdmin: false },
];

async function list() {
  const db = getDb();
  const rows = await db
    .select({
      id: founderProfiles.id,
      displayName: founderProfiles.displayName,
      email: founderProfiles.email,
      status: founderProfiles.status,
      isSuperAdmin: founderProfiles.isSuperAdmin,
      passwordHash: founderProfiles.passwordHash,
      lastLoginAt: founderProfiles.lastLoginAt,
    })
    .from(founderProfiles);
  console.log("");
  console.log("id                  display   email                     status    super  password  last login");
  console.log("-".repeat(100));
  for (const r of rows) {
    console.log(
      [
        r.id.padEnd(19),
        (r.displayName ?? "").padEnd(9),
        (r.email ?? "—").padEnd(25),
        (r.status ?? "").padEnd(9),
        (r.isSuperAdmin ? "yes" : "no").padEnd(6),
        (r.passwordHash ? "set" : "UNSET").padEnd(9),
        r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : "never",
      ].join(" "),
    );
  }
  console.log("");
}

async function seedTest() {
  if (process.env.NODE_ENV === "production") {
    console.error("refusing to seed synthetic test founders with NODE_ENV=production");
    process.exit(1);
  }
  const db = getDb();
  const now = new Date();
  const issued: Array<{ email: string; password: string }> = [];

  for (const f of TEST_FOUNDERS) {
    const password = generatePassword();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const updated = await db
      .update(founderProfiles)
      .set({
        email: normalizeEmail(f.email),
        passwordHash: hash,
        isSuperAdmin: f.superAdmin,
        status: "active",
        passwordChangedAt: now,
        updatedAt: now,
      })
      .where(eq(founderProfiles.id, f.id))
      .returning({ id: founderProfiles.id });

    if (updated.length === 0) {
      console.error(`  ! ${f.id} does not exist — run \`npm run db:seed\` first`);
      continue;
    }
    issued.push({ email: f.email, password });
  }

  console.log("");
  console.log("Synthetic founder accounts (LOCAL UAT ONLY — printed once, not stored anywhere):");
  console.log("");
  for (const i of issued) console.log(`  ${i.email.padEnd(24)} ${i.password}`);
  console.log("");
  console.log("Super admin: moiz@wobble.local");
  console.log("");
}

async function setFounder() {
  const id = arg("founder");
  if (!id) {
    console.error("--founder requires a founder_profiles id (see --list)");
    process.exit(1);
  }
  const db = getDb();
  const rows = await db.select().from(founderProfiles).where(eq(founderProfiles.id, id)).limit(1);
  const existing = rows[0];
  if (!existing) {
    console.error(`no founder profile with id "${id}" — see --list`);
    process.exit(1);
  }

  // --disable / --enable are status-only operations; disabling also drops live sessions.
  if (flag("disable") || flag("enable")) {
    const status = flag("disable") ? "disabled" : "active";
    await db.update(founderProfiles).set({ status, updatedAt: new Date() }).where(eq(founderProfiles.id, id));
    const revoked = status === "disabled" ? await revokeFounderSessions(id) : 0;
    console.log(`${existing.displayName} (${id}) is now ${status}${status === "disabled" ? ` — ${revoked} session(s) revoked` : ""}`);
    return;
  }

  const email = arg("email") ?? existing.email;
  if (!email) {
    console.error("--email is required the first time a founder account is created");
    process.exit(1);
  }

  const password = await readSecret(`New password for ${existing.displayName} (${email}): `);
  const weak = validatePasswordStrength(password);
  if (weak) {
    console.error(weak);
    process.exit(1);
  }

  const now = new Date();
  await db
    .update(founderProfiles)
    .set({
      email: normalizeEmail(email),
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      passwordChangedAt: now,
      updatedAt: now,
      ...(flag("super-admin") ? { isSuperAdmin: true } : {}),
      ...(flag("no-super-admin") ? { isSuperAdmin: false } : {}),
    })
    .where(eq(founderProfiles.id, id));

  // A credential rotation invalidates existing sessions for that founder.
  const revoked = await revokeFounderSessions(id);
  console.log(`set password for ${existing.displayName} <${normalizeEmail(email)}> — ${revoked} existing session(s) revoked`);
}

async function main() {
  loadEnvFile();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  try {
    if (flag("list")) return await list();
    if (flag("seed-test")) return await seedTest();
    if (flag("founder")) return await setFounder();
    console.log(
      [
        "",
        "Founder account bootstrap. Credentials live in Postgres, never in this repo.",
        "",
        "  npm run auth:bootstrap -- --list",
        "  npm run auth:bootstrap -- --seed-test                       # 4 synthetic founders for local UAT",
        "  npm run auth:bootstrap -- --founder founder_moiz --email moiz@example.com --super-admin",
        "  npm run auth:bootstrap -- --founder founder_ali --disable   # also revokes live sessions",
        "  npm run auth:bootstrap -- --founder founder_ali --enable",
        "",
        `Passwords are read from stdin (not echoed) or WOBBLE_BOOTSTRAP_PASSWORD, min ${MIN_PASSWORD_LENGTH} chars.`,
        "",
      ].join("\n"),
    );
  } finally {
    await closeDb().catch(() => {});
  }
}

await main();
