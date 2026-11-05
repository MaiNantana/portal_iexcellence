"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/actions";
import { requireAdmin, requireMember, slugFrom, type Member } from "@/lib/context";
import { db } from "@/lib/db";
import { HR_DEFAULT_ORIGIN, hrDatabases, isHrBaseUrl, hrLogin, type HrDatabase } from "@/lib/hr";
import { safeHttpsUrl } from "@/lib/portal";

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
  if (tooManyFailures(member.userId)) return { error: "ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาที" };

  const user = String(form.get("hrUser") ?? "").trim();
  const passwd = String(form.get("hrPassword") ?? "");
  if (!user || !passwd) return { error: "กรอกชื่อผู้ใช้และรหัสผ่าน HR" };

  let token: string | null;
  let database: HrDatabase | undefined;
  try {
    const dbs = await hrDatabases(hrBaseUrl);
    if (!dbs.length) return { error: "ไม่พบฐานข้อมูล HR ของบริษัทนี้ ตรวจสอบ URL ของ HR" };
    database = dbs.find((d) => d.name === form.get("hrDb")) ?? (dbs.length === 1 ? dbs[0] : undefined);
    if (!database) return { error: "เลือกฐานข้อมูล HR" };
    token = await hrLogin(hrBaseUrl, database, user, passwd);
  } catch (err) {
    console.error("[hr-link] HR API failed:", err);
    return { error: "ติดต่อระบบ HR ไม่ได้ ลองใหม่อีกครั้ง" };
  }
  if (!token) {
    failures.get(member.userId)!.push(Date.now());
    return { error: "ชื่อผู้ใช้หรือรหัสผ่าน HR ไม่ถูกต้อง" };
  }

  const taken = await db.accountLink.findUnique({
    where: { orgId_system_externalUserId: { orgId: member.orgId, system: "HR", externalUserId: token } },
  });
  if (taken && taken.userId !== member.userId) return { error: "บัญชี HR นี้เชื่อมกับผู้ใช้ Portal คนอื่นอยู่แล้ว ติดต่อ Admin" };

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
  if (!org.hrEnabled || !org.hrBaseUrl) return { error: "บริษัทยังไม่ได้เชื่อมต่อ HR" };
  const failed = await verifyAndLink(member, org.hrBaseUrl, form);
  if (failed) return failed;
  revalidatePath("/", "layout");
  return { ok: "เชื่อมบัญชี HR แล้ว" };
}

/** Admin connects HR: the URL only counts once the admin has signed in to that HR successfully. */
export async function connectHr(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(slugFrom(form));
  const hrBaseUrl = safeHttpsUrl(form.get("hrBaseUrl") as string);
  if (!hrBaseUrl || !isHrBaseUrl(hrBaseUrl)) return { error: `URL ของ HR ต้องเป็น ${HR_DEFAULT_ORIGIN}/<บริษัท>` };
  const failed = await verifyAndLink(admin, hrBaseUrl, form);
  if (failed) return failed;
  await db.org.update({ where: { id: admin.orgId }, data: { hrEnabled: true, hrBaseUrl } });
  revalidatePath("/", "layout");
  return { ok: "เชื่อมต่อ HR Excellence แล้ว" };
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

/** Unlinks the member's HR account in one database. */
export async function unlinkHr(slug: string, externalDb: string) {
  const member = await requireMember(slug);
  await db.accountLink.deleteMany({ where: { orgId: member.orgId, userId: member.userId, system: "HR", externalDb } });
  revalidatePath("/", "layout");
}
