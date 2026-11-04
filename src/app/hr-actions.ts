"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/actions";
import { requireMember, slugFrom } from "@/lib/context";
import { db } from "@/lib/db";
import { hrCustomer, hrDatabases, hrLogin } from "@/lib/hr";

// Wrong HR passwords per Portal user: at most 5 per 15 minutes (single server, so in memory is enough).
const failures = new Map<string, number[]>();
const WINDOW_MS = 15 * 60_000;

function tooManyFailures(userId: string) {
  const recent = (failures.get(userId) ?? []).filter((t) => Date.now() - t < WINDOW_MS);
  failures.set(userId, recent);
  return recent.length >= 5;
}

export async function linkHr(_: FormState, form: FormData): Promise<FormState> {
  const member = await requireMember(slugFrom(form));
  const { org } = member;
  if (!org.hrEnabled || !org.hrBaseUrl) return { error: "บริษัทยังไม่ได้เชื่อมต่อ HR" };
  if (tooManyFailures(member.userId)) return { error: "ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาที" };

  const user = String(form.get("hrUser") ?? "").trim();
  const passwd = String(form.get("hrPassword") ?? "");
  if (!user || !passwd) return { error: "กรอกชื่อผู้ใช้และรหัสผ่าน HR" };

  let token: string | null;
  try {
    const dbs = await hrDatabases(hrCustomer(org.hrBaseUrl));
    const database = dbs.find((d) => d.name === form.get("hrDb")) ?? (dbs.length === 1 ? dbs[0] : undefined);
    if (!database) return { error: "เลือกฐานข้อมูล HR" };
    token = await hrLogin(database, user, passwd);
  } catch (err) {
    console.error("[hr-link] HR API failed:", err);
    return { error: "ติดต่อระบบ HR ไม่ได้ ลองใหม่อีกครั้ง" };
  }
  if (!token) {
    failures.get(member.userId)!.push(Date.now());
    return { error: "ชื่อผู้ใช้หรือรหัสผ่าน HR ไม่ถูกต้อง" };
  }

  const taken = await db.accountLink.findUnique({
    where: { orgId_system_externalUserId: { orgId: org.id, system: "HR", externalUserId: token } },
  });
  if (taken && taken.userId !== member.userId) return { error: "บัญชี HR นี้เชื่อมกับผู้ใช้ Portal คนอื่นอยู่แล้ว ติดต่อ Admin" };

  await db.accountLink.upsert({
    where: { orgId_userId_system: { orgId: org.id, userId: member.userId, system: "HR" } },
    create: { orgId: org.id, userId: member.userId, system: "HR", externalUserId: token },
    update: { externalUserId: token, linkedAt: new Date() },
  });
  revalidatePath("/", "layout");
  return { ok: "เชื่อมบัญชี HR แล้ว" };
}

export async function unlinkHr(slug: string) {
  const member = await requireMember(slug);
  await db.accountLink.deleteMany({ where: { orgId: member.orgId, userId: member.userId, system: "HR" } });
  revalidatePath("/", "layout");
}
