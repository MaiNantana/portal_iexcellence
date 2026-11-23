"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/actions";
import { requireAdmin, requireMember, slugFrom, type Member } from "@/lib/context";
import { db } from "@/lib/db";
import { HR_DEFAULT_ORIGIN, hrActiveEmployees, hrDatabases, isHrBaseUrl, hrLogin, type HrDatabase, type HrEmployee } from "@/lib/hr";
import { safeHttpsUrl } from "@/lib/portal";
import { defineText } from "@/i18n";
import { getLocale } from "@/i18n/server";

const TEXT = defineText({
  th: {
    tooMany: "ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาที",
    fillIn: "กรอกชื่อผู้ใช้และรหัสผ่าน HR",
    noDatabases: "ไม่พบฐานข้อมูล HR ของบริษัทนี้ ตรวจสอบ URL ของ HR",
    pickDatabase: "เลือกฐานข้อมูล HR",
    unreachable: "ติดต่อระบบ HR ไม่ได้ ลองใหม่อีกครั้ง",
    wrong: "ชื่อผู้ใช้หรือรหัสผ่าน HR ไม่ถูกต้อง",
    taken: "บัญชี HR นี้เชื่อมกับผู้ใช้ Portal คนอื่นอยู่แล้ว ติดต่อ Admin",
    hrOff: "บริษัทยังไม่ได้เชื่อมต่อ HR",
    linked: "เชื่อมบัญชี HR แล้ว",
    badUrl: (origin: string) => `URL ของ HR ต้องเป็น ${origin}/<บริษัท>`,
    connected: "เชื่อมต่อ HR Excellence แล้ว",
    listFailed: "ดึงรายชื่อจาก HR ไม่ได้ ลองใหม่อีกครั้ง",
  },
  en: {
    tooMany: "Too many wrong attempts. Please wait 15 minutes.",
    fillIn: "Enter your HR username and password.",
    noDatabases: "No HR database found for this company. Check the HR URL.",
    pickDatabase: "Choose an HR database.",
    unreachable: "Can't reach HR. Please try again.",
    wrong: "Wrong HR username or password.",
    taken: "This HR account is already linked to another Portal user. Ask your Admin.",
    hrOff: "Your company hasn't connected HR yet.",
    linked: "HR account linked.",
    badUrl: (origin: string) => `The HR URL must be ${origin}/<company>`,
    connected: "HR Excellence connected.",
    listFailed: "Can't load the employee list from HR. Please try again.",
  },
});

const text = async () => TEXT[await getLocale()];

// Wrong HR passwords per Portal user: at most 5 per 15 minutes (single server, so in memory is enough).
const failures = new Map<string, number[]>();
const WINDOW_MS = 15 * 60_000;

function tooManyFailures(userId: string) {
  const recent = (failures.get(userId) ?? []).filter((t) => Date.now() - t < WINDOW_MS);
  failures.set(userId, recent);
  return recent.length >= 5;
}

/** Signs in to HR with the form's database/username/password and links that HR account to the member. */
async function verifyAndLink(member: Member, hrBaseUrl: string, form: FormData): Promise<FormState> {
  const t = await text();
  if (tooManyFailures(member.userId)) return { error: t.tooMany };

  const user = String(form.get("hrUser") ?? "").trim();
  const passwd = String(form.get("hrPassword") ?? "");
  if (!user || !passwd) return { error: t.fillIn };

  let token: string | null;
  let database: HrDatabase | undefined;
  try {
    const dbs = await hrDatabases(hrBaseUrl);
    if (!dbs.length) return { error: t.noDatabases };
    database = dbs.find((d) => d.name === form.get("hrDb")) ?? (dbs.length === 1 ? dbs[0] : undefined);
    if (!database) return { error: t.pickDatabase };
    token = await hrLogin(hrBaseUrl, database, user, passwd);
  } catch (err) {
    console.error("[hr-link] HR API failed:", err);
    return { error: t.unreachable };
  }
  if (!token) {
    failures.get(member.userId)!.push(Date.now());
    return { error: t.wrong };
  }

  const taken = await db.accountLink.findUnique({
    where: { orgId_system_externalUserId: { orgId: member.orgId, system: "HR", externalUserId: token } },
  });
  if (taken && taken.userId !== member.userId) return { error: t.taken };

  // One account per HR database: signing in to a database again replaces that database's account only.
  const externalDb = database!.name;
  await db.accountLink.upsert({
    where: { orgId_userId_system_externalDb: { orgId: member.orgId, userId: member.userId, system: "HR", externalDb } },
    create: { orgId: member.orgId, userId: member.userId, system: "HR", externalDb, externalUserId: token },
    update: { externalUserId: token, externalRef: null, linkedAt: new Date() },
  });
  return undefined;
}

export async function linkHr(_: FormState, form: FormData): Promise<FormState> {
  const member = await requireMember(slugFrom(form));
  const { org } = member;
  const t = await text();
  if (!org.hrEnabled || !org.hrBaseUrl) return { error: t.hrOff };
  const failed = await verifyAndLink(member, org.hrBaseUrl, form);
  if (failed) return failed;
  revalidatePath("/", "layout");
  return { ok: t.linked };
}

/** Admin connects HR: the URL only counts once the admin has signed in to that HR successfully. */
export async function connectHr(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(slugFrom(form));
  const hrBaseUrl = safeHttpsUrl(form.get("hrBaseUrl") as string);
  const t = await text();
  if (!hrBaseUrl || !isHrBaseUrl(hrBaseUrl)) return { error: t.badUrl(HR_DEFAULT_ORIGIN) };
  const failed = await verifyAndLink(admin, hrBaseUrl, form);
  if (failed) return failed;
  await db.org.update({ where: { id: admin.orgId }, data: { hrEnabled: true, hrBaseUrl } });
  revalidatePath("/", "layout");
  return { ok: t.connected };
}

/** Databases for the HR URL the admin is typing, so the connect form can offer the right choices. */
export async function listHrDatabases(slug: string, hrBaseUrl: string): Promise<HrDatabase[] | null> {
  await requireAdmin(slug);
  const url = safeHttpsUrl(hrBaseUrl);
  if (!url || !isHrBaseUrl(url)) return null;
  try {
    return (await hrDatabases(url)).map((d) => ({ ...d, server: "" }));
  } catch {
    return null;
  }
}

export type HrInvitee = HrEmployee & { db: string; status: "member" | "invited" | null };

/** Active HR employees (every HR database of the company) for the admin's invite picker, marked if already in the Portal. */
export async function listHrInvitees(slug: string): Promise<{ employees: HrInvitee[] } | { error: string }> {
  const admin = await requireAdmin(slug);
  const { hrEnabled, hrBaseUrl } = admin.org;
  const t = await text();
  if (!hrEnabled || !hrBaseUrl) return { error: t.hrOff };
  let employees: (HrEmployee & { db: string })[];
  try {
    const dbs = await hrDatabases(hrBaseUrl);
    const lists = await Promise.all(dbs.map(async (d) => (await hrActiveEmployees(hrBaseUrl, d)).map((e) => ({ ...e, db: d.caption }))));
    employees = lists.flat();
  } catch (err) {
    console.error("[hr-invite] HR API failed:", err);
    return { error: t.listFailed };
  }
  const emails = [...new Set(employees.flatMap((e) => (e.email ? [e.email] : [])))];
  const [members, invites] = await Promise.all([
    db.membership.findMany({ where: { orgId: admin.orgId, user: { email: { in: emails } } }, select: { user: { select: { email: true } } } }),
    db.invitation.findMany({ where: { orgId: admin.orgId, acceptedAt: null, email: { in: emails } }, select: { email: true } }),
  ]);
  const memberEmails = new Set(members.map((m) => m.user.email));
  const invited = new Set(invites.map((i) => i.email));
  return {
    employees: employees.map((e) => ({
      ...e,
      status: e.email && memberEmails.has(e.email) ? "member" : e.email && invited.has(e.email) ? "invited" : null,
    })),
  };
}

/** Unlinks the member's HR account in one database. */
export async function unlinkHr(slug: string, externalDb: string) {
  const member = await requireMember(slug);
  await db.accountLink.deleteMany({ where: { orgId: member.orgId, userId: member.userId, system: "HR", externalDb } });
  revalidatePath("/", "layout");
}
