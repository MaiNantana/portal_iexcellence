import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { db } from "@/lib/db";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const CODE_TTL_MINUTES = 10;
const CODE_MAX_ATTEMPTS = 5;
const CODE_RESEND_SECONDS = 60;

export function normalizeEmail(raw: unknown) {
  const email = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 191 ? email : null;
}

/** Free mailbox providers can never be claimed as a company domain. */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com",
  "yahoo.co.th", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "gmx.com", "zoho.com",
]);

async function join(orgId: string, userId: string, role: "ADMIN" | "EMPLOYEE" = "EMPLOYEE", department: string | null = null) {
  await db.membership.upsert({
    where: { orgId_userId: { orgId, userId } },
    update: {},
    create: { orgId, userId, role, department },
  });
}

/**
 * Adds memberships this verified email is entitled to: pending invitations and orgs that
 * verified the email's domain with auto-join on. Returns how many memberships the user has.
 */
export async function syncMemberships(userId: string, email: string) {
  const invites = await db.invitation.findMany({ where: { email, acceptedAt: null } });
  for (const inv of invites) {
    await join(inv.orgId, userId, inv.role, inv.department);
    await db.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
  }
  const domain = email.split("@")[1];
  const domains = await db.orgDomain.findMany({ where: { domain, autoJoin: true, verifiedAt: { not: null } } });
  for (const d of domains) await join(d.orgId, userId);
  return db.membership.count({ where: { userId } });
}

/**
 * Maps a Google / Microsoft sign-in to a portal user: known (provider, subject) wins, otherwise
 * the provider-verified email links to the existing user or creates one.
 */
export async function resolveOAuthUser(input: { provider: string; subject: string; email: string; name?: string | null }) {
  const known = await db.identity.findUnique({
    where: { provider_subject: { provider: input.provider, subject: input.subject } },
    include: { user: true },
  });
  let user = known?.user ?? (await db.user.findUnique({ where: { email: input.email } }));

  if (!user) {
    user = await db.user.create({ data: { email: input.email, name: input.name ?? null, emailVerifiedAt: new Date() } });
  }
  if (!known) {
    await db.identity.create({ data: { userId: user.id, provider: input.provider, subject: input.subject, email: input.email } });
  }
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), emailVerifiedAt: user.emailVerifiedAt ?? new Date(), name: user.name ?? input.name ?? null },
  });
  await syncMemberships(user.id, user.email);
  return user.id;
}

// Verifying against a real hash for unknown emails keeps response time from revealing which accounts exist.
const DUMMY_HASH = hash("not-a-real-password-" + Date.now());

export type PasswordResult = { userId: string } | { error: "invalid" | "locked" | "unverified" };

export async function checkPassword(email: string, password: string): Promise<PasswordResult> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    await verify(await DUMMY_HASH, password).catch(() => false);
    return { error: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) return { error: "locked" };

  if (!(await verify(user.passwordHash, password).catch(() => false))) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED_LOGINS
        ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
        : { failedLogins: failed },
    });
    return { error: "invalid" };
  }
  if (!user.emailVerifiedAt) return { error: "unverified" };

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await syncMemberships(user.id, user.email);
  return { userId: user.id };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Creates a 6-digit code, or returns null if one was sent too recently. Only the hash is stored. */
export async function createEmailCode(email: string) {
  const recent = await db.emailCode.findFirst({
    where: { email, createdAt: { gt: new Date(Date.now() - CODE_RESEND_SECONDS * 1000) } },
  });
  if (recent) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.emailCode.updateMany({ where: { email, usedAt: null }, data: { usedAt: new Date() } });
  await db.emailCode.create({
    data: { email, codeHash: sha256(`${email}:${code}`), expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000) },
  });
  return code;
}

export async function consumeEmailCode(email: string, code: string) {
  const row = await db.emailCode.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.attempts >= CODE_MAX_ATTEMPTS) return false;
  const ok = timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(sha256(`${email}:${code.trim()}`)));
  await db.emailCode.update({ where: { id: row.id }, data: ok ? { usedAt: new Date() } : { attempts: { increment: 1 } } });
  return ok;
}

export function validatePassword(pw: string) {
  if (pw.length < 10) return "รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร";
  if (pw.length > 128) return "รหัสผ่านยาวเกินไป";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข";
  return null;
}

export const hashPassword = (pw: string) => hash(pw);
