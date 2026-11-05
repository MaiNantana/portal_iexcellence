"use server";

import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/actions";
import { orgPath, requireAdmin, requireUser, slugFrom } from "@/lib/context";
import { db } from "@/lib/db";
import { PUBLIC_EMAIL_DOMAINS } from "@/lib/identity";
import { domainTxtName } from "@/lib/portal";

const MAX_ORGS_CREATED_PER_DAY = 3;
const newCode = () => randomBytes(9).toString("base64url");
// Every app page lives under the company code (/abc/login, /abc/admin, …), so the root only holds
// "/" and Auth.js's /api; reserve that plus a few infrastructure names.
const RESERVED_SLUGS = new Set(["api", "assets", "static", "www"]);

/** Company code used in URLs (/<slug>): 3–30 of a-z, 0-9 and inner hyphens / underscores. */
async function slugError(slug: string, exceptOrgId?: string) {
  if (!/^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$/.test(slug)) return "รหัสบริษัทใช้ a-z, 0-9, - และ _ ได้ 3–30 ตัว (ห้ามขึ้นต้นหรือลงท้ายด้วย - หรือ _)";
  if (RESERVED_SLUGS.has(slug)) return "รหัสนี้สงวนไว้ กรุณาใช้รหัสอื่น";
  const taken = await db.org.findUnique({ where: { slug }, select: { id: true } });
  if (taken && taken.id !== exceptOrgId) return "รหัสบริษัทนี้ถูกใช้แล้ว";
  return null;
}

// ---- Onboarding (any signed-in user) ----

export async function createOrg(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  if (name.length < 2 || name.length > 100) return { error: "กรุณากรอกชื่อบริษัท 2–100 ตัวอักษร" };
  const bad = await slugError(slug);
  if (bad) return { error: bad };
  const recent = await db.membership.count({
    where: { userId: user.id, role: "ADMIN", createdAt: { gt: new Date(Date.now() - 86_400_000) } },
  });
  if (recent >= MAX_ORGS_CREATED_PER_DAY) return { error: "สร้างบริษัทได้ไม่เกิน 3 แห่งต่อวัน" };

  await db.org.create({ data: { name, slug, memberships: { create: { userId: user.id, role: "ADMIN" } } } });
  redirect(orgPath(slug, "/admin?tab=access"));
}

/** Accepts a pasted join link (…/abc/join/<code>) or just its code. */
export async function goToJoinCode(_: FormState, form: FormData): Promise<FormState> {
  const raw = String(form.get("code") ?? "").trim();
  const code = raw.split("/join/").pop()?.split(/[?#]/)[0] ?? "";
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(code)) return { error: "ลิงก์หรือรหัสเข้าร่วมไม่ถูกต้อง" };
  const org = await db.org.findFirst({ where: { joinCode: code, joinMode: { not: "OFF" } }, select: { slug: true } });
  if (!org) return { error: "ไม่พบลิงก์เข้าร่วมนี้ หรือถูกปิดไปแล้ว" };
  redirect(orgPath(org.slug, `/join/${code}`));
}

export async function joinByCode(slug: string, code: string) {
  const joinUrl = orgPath(slug, `/join/${code}`);
  const user = await requireUser(joinUrl);
  const org = await db.org.findFirst({ where: { slug, joinCode: code, joinMode: { not: "OFF" } } });
  if (!org) redirect(joinUrl);
  const member = await db.membership.findUnique({ where: { orgId_userId: { orgId: org.id, userId: user.id } } });
  if (member || org.joinMode === "OPEN") {
    if (!member) await db.membership.create({ data: { orgId: org.id, userId: user.id } });
    redirect(orgPath(org.slug));
  }
  await db.joinRequest.upsert({ where: { orgId_userId: { orgId: org.id, userId: user.id } }, update: {}, create: { orgId: org.id, userId: user.id } });
  redirect(joinUrl);
}

// ---- Admin: company profile ----

export async function updateOrgProfile(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(slugFrom(form));
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  if (name.length < 2 || name.length > 100) return { error: "กรุณากรอกชื่อบริษัท 2–100 ตัวอักษร" };
  const bad = await slugError(slug, admin.orgId);
  if (bad) return { error: bad };
  await db.org.update({ where: { id: admin.orgId }, data: { name, slug } });
  revalidatePath("/", "layout");
  if (slug !== admin.org.slug) redirect(orgPath(slug, "/admin?tab=access"));
  return { ok: "บันทึกข้อมูลบริษัทแล้ว" };
}

// ---- Admin: join link ----

export async function setJoinMode(slug: string, form: FormData) {
  const admin = await requireAdmin(slug);
  const mode = String(form.get("mode"));
  if (mode !== "OFF" && mode !== "APPROVAL" && mode !== "OPEN") return;
  await db.org.update({ where: { id: admin.orgId }, data: { joinMode: mode, joinCode: admin.org.joinCode ?? newCode() } });
  revalidatePath("/", "layout");
}

/** Invalidates the old link immediately. */
export async function regenerateJoinCode(slug: string) {
  const admin = await requireAdmin(slug);
  await db.org.update({ where: { id: admin.orgId }, data: { joinCode: newCode() } });
  revalidatePath("/", "layout");
}

export async function decideJoinRequest(slug: string, id: string, approve: boolean) {
  const admin = await requireAdmin(slug);
  const req = await db.joinRequest.findFirst({ where: { id, orgId: admin.orgId } });
  if (!req) return;
  await db.$transaction([
    ...(approve
      ? [db.membership.upsert({ where: { orgId_userId: { orgId: req.orgId, userId: req.userId } }, update: {}, create: { orgId: req.orgId, userId: req.userId } })]
      : []),
    db.joinRequest.delete({ where: { id: req.id } }),
  ]);
  revalidatePath("/", "layout");
}

// ---- Admin: email domains ----

export async function addDomain(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(slugFrom(form));
  const domain = String(form.get("domain") ?? "").trim().toLowerCase().replace(/^.*@/, "");
  if (!/^(?=.{4,191}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) return { error: "รูปแบบโดเมนไม่ถูกต้อง เช่น abc.co.th" };
  if (PUBLIC_EMAIL_DOMAINS.has(domain)) return { error: "โดเมนอีเมลสาธารณะ (เช่น gmail.com) ใช้ไม่ได้ กรุณาใช้ลิงก์เข้าร่วมแทน" };
  if (await db.orgDomain.findFirst({ where: { domain, verifiedAt: { not: null }, orgId: { not: admin.orgId } } })) {
    return { error: "โดเมนนี้ถูกยืนยันโดยบริษัทอื่นแล้ว" };
  }
  await db.orgDomain.upsert({
    where: { orgId_domain: { orgId: admin.orgId, domain } },
    update: {},
    create: { orgId: admin.orgId, domain, verifyToken: `iexcellence-verify=${newCode()}` },
  });
  revalidatePath("/", "layout");
  return { ok: `เพิ่ม ${domain} แล้ว · เพิ่ม TXT record ด้านล่างแล้วกดตรวจสอบ` };
}

export async function verifyDomain(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(slugFrom(form));
  const d = await db.orgDomain.findFirst({ where: { id: String(form.get("id")), orgId: admin.orgId } });
  if (!d) return { error: "ไม่พบโดเมน" };
  let records: string[] = [];
  try {
    records = (await resolveTxt(domainTxtName(d.domain))).map((parts) => parts.join(""));
  } catch {
    return { error: `ยังไม่พบ TXT record ที่ ${domainTxtName(d.domain)} (DNS อาจใช้เวลาหลายนาทีถึงหลายชั่วโมง)` };
  }
  if (!records.includes(d.verifyToken)) return { error: "พบ TXT record แต่ค่าไม่ตรง กรุณาตรวจสอบอีกครั้ง" };
  if (await db.orgDomain.findFirst({ where: { domain: d.domain, verifiedAt: { not: null }, orgId: { not: admin.orgId } } })) {
    return { error: "โดเมนนี้ถูกยืนยันโดยบริษัทอื่นแล้ว" };
  }
  await db.orgDomain.update({ where: { id: d.id }, data: { verifiedAt: new Date() } });
  revalidatePath("/", "layout");
  return { ok: `ยืนยัน ${d.domain} สำเร็จ` };
}

export async function toggleDomainAutoJoin(slug: string, id: string) {
  const admin = await requireAdmin(slug);
  const d = await db.orgDomain.findFirst({ where: { id, orgId: admin.orgId } });
  if (d) await db.orgDomain.update({ where: { id }, data: { autoJoin: !d.autoJoin } });
  revalidatePath("/", "layout");
}

export async function removeDomain(slug: string, id: string) {
  const admin = await requireAdmin(slug);
  await db.orgDomain.deleteMany({ where: { id, orgId: admin.orgId } });
  revalidatePath("/", "layout");
}
