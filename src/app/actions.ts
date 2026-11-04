"use server";

// Tenant actions take the org slug explicitly (bound argument, or the hidden "org" form field)
// and re-check membership for that org, so a request can never act on a company you don't belong to.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { orgPath, requireAdmin, requireMember, requireUser, slugFrom } from "@/lib/context";
import { normalizeEmail, syncMemberships } from "@/lib/identity";
import { sendMail } from "@/lib/mail";
import { encryptSecret } from "@/lib/secrets";
import { CHANNELS, getQuickEntries, newsWhere, pinnedEntries, safeHttpsUrl } from "@/lib/portal";

export type FormState = { error?: string; ok?: string } | undefined;

export async function acknowledgeNews(slug: string, newsId: string) {
  const member = await requireMember(slug);
  const news = await db.news.findFirst({ where: { id: newsId, ...newsWhere(member) } });
  if (!news?.requiresAck) return;
  await db.newsAck.upsert({
    where: { newsId_userId: { newsId, userId: member.userId } },
    update: {},
    create: { newsId, userId: member.userId },
  });
  revalidatePath("/", "layout");
}

export async function togglePin(slug: string, key: string) {
  const member = await requireMember(slug);
  const entries = await getQuickEntries(member);
  if (!entries.some((e) => e.key === key)) return;
  const current = pinnedEntries(member, entries).map((e) => e.key);
  const pins = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
  await db.membership.update({ where: { id: member.id }, data: { pins, pinsCustomized: true } });
  revalidatePath("/", "layout");
}

const linkSchema = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.string(),
  visibility: z.enum(["PERSONAL", "COMPANY"]),
});

export async function addLink(_: FormState, form: FormData): Promise<FormState> {
  const member = await requireMember(slugFrom(form));
  const parsed = linkSchema.safeParse({
    name: form.get("name"),
    url: form.get("url"),
    visibility: form.get("visibility") ?? "PERSONAL",
  });
  const url = safeHttpsUrl(parsed.data?.url);
  if (!parsed.success || !url) return { error: "กรุณากรอกชื่อและ URL แบบ HTTPS ที่ถูกต้อง" };
  const company = parsed.data.visibility === "COMPANY";
  if (company && member.role !== "ADMIN") return { error: "เฉพาะ Admin ที่เพิ่มลิงก์ของบริษัทได้" };

  const link = await db.appLink.create({
    data: { orgId: member.orgId, ownerId: company ? null : member.userId, name: parsed.data.name, url, visibility: parsed.data.visibility },
  });
  if (form.get("pin") === "on") {
    const current = pinnedEntries(member, await getQuickEntries(member)).map((e) => e.key);
    await db.membership.update({ where: { id: member.id }, data: { pins: [...current, `app:${link.id}`], pinsCustomized: true } });
  }
  revalidatePath("/", "layout");
  return { ok: "เพิ่มลิงก์แล้ว" };
}

/** Personal links belong to their owner; company links to the tenant's admins. */
async function findEditableLink(slug: string, id: string) {
  const member = await requireMember(slug);
  const link = await db.appLink.findFirst({ where: { id, orgId: member.orgId } });
  if (!link) return null;
  const allowed = link.visibility === "PERSONAL" ? link.ownerId === member.userId : member.role === "ADMIN";
  return allowed ? link : null;
}

export async function updateLink(_: FormState, form: FormData): Promise<FormState> {
  const slug = slugFrom(form);
  const link = await findEditableLink(slug, String(form.get("id") ?? ""));
  if (!link) return { error: "ไม่พบลิงก์ หรือคุณไม่มีสิทธิ์แก้ไข" };
  const name = String(form.get("name") ?? "").trim();
  const url = safeHttpsUrl(form.get("url") as string);
  if (!name || name.length > 60 || !url) return { error: "กรุณากรอกชื่อและ URL แบบ HTTPS ที่ถูกต้อง" };
  await db.appLink.update({ where: { id: link.id }, data: { name, url } });
  revalidatePath("/", "layout");
  redirect(orgPath(slug, "/launcher"));
}

export async function deleteLink(slug: string, id: string) {
  const link = await findEditableLink(slug, id);
  if (!link) return;
  await db.appLink.delete({ where: { id: link.id } });
  revalidatePath("/", "layout");
}

const newsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  channel: z.string().refine((c) => c in CHANNELS),
  audience: z.string().trim().min(1).max(40),
});

export async function createNews(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(slugFrom(form));
  const parsed = newsSchema.safeParse({
    title: form.get("title"),
    body: form.get("body"),
    channel: form.get("channel"),
    audience: form.get("audience"),
  });
  if (!parsed.success) return { error: "กรุณากรอกหัวข้อ เนื้อหา และเลือก Channel" };
  await db.news.create({
    data: {
      ...parsed.data,
      orgId: admin.orgId,
      requiresAck: form.get("requiresAck") === "on",
      authorName: admin.user.name ?? admin.user.email,
    },
  });
  revalidatePath("/", "layout");
  return { ok: "เผยแพร่ใน Portal แล้ว" };
}

export async function deleteNews(slug: string, id: string) {
  const admin = await requireAdmin(slug);
  await db.news.deleteMany({ where: { id, orgId: admin.orgId } });
  revalidatePath("/", "layout");
}

export async function updateConnections(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(slugFrom(form));
  const hrEnabled = form.get("hrEnabled") === "on";
  const taskEnabled = form.get("taskEnabled") === "on";
  const hrBaseUrl = safeHttpsUrl(form.get("hrBaseUrl") as string);
  if (hrEnabled && !hrBaseUrl) return { error: "HR ที่เปิดใช้ต้องมี URL แบบ HTTPS" };
  // The key is write-only: blank keeps the stored one, "clear" removes it.
  const rawKey = String(form.get("taskApiKey") ?? "").trim();
  if (rawKey && rawKey !== "clear" && !/^tmk_[0-9a-f]{64}$/.test(rawKey)) return { error: "API key ของ Task ต้องขึ้นต้นด้วย tmk_" };
  const keyData =
    rawKey === "clear"
      ? { taskApiKeyEnc: null, taskApiKeyHint: null }
      : rawKey
        ? { taskApiKeyEnc: encryptSecret(rawKey), taskApiKeyHint: rawKey.slice(0, 12) }
        : {};
  await db.org.update({ where: { id: admin.orgId }, data: { hrEnabled, hrBaseUrl, taskEnabled, ...keyData } });
  revalidatePath("/", "layout");
  return { ok: "บันทึกการเชื่อมต่อแล้ว" };
}

export async function setMemberRole(slug: string, membershipId: string, role: "ADMIN" | "EMPLOYEE") {
  const admin = await requireAdmin(slug);
  const target = await db.membership.findFirst({ where: { id: membershipId, orgId: admin.orgId } });
  if (!target || target.role === role) return;
  if (role === "EMPLOYEE" && (await db.membership.count({ where: { orgId: admin.orgId, role: "ADMIN" } })) <= 1) {
    return; // never leave a tenant without an admin
  }
  await db.membership.update({ where: { id: target.id }, data: { role } });
  revalidatePath("/", "layout");
}

const inviteSchema = z.object({
  role: z.enum(["ADMIN", "EMPLOYEE"]),
  department: z.string().trim().max(40),
});

export async function inviteMember(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(slugFrom(form));
  const email = normalizeEmail(form.get("email"));
  const parsed = inviteSchema.safeParse({ role: form.get("role"), department: form.get("department") ?? "" });
  if (!email || !parsed.success) return { error: "กรุณากรอกอีเมลให้ถูกต้อง" };
  if (await db.membership.findFirst({ where: { orgId: admin.orgId, user: { email } } })) {
    return { error: "อีเมลนี้เป็นสมาชิกของบริษัทอยู่แล้ว" };
  }
  const data = { role: parsed.data.role, department: parsed.data.department || null, invitedBy: admin.user.email, acceptedAt: null };
  await db.invitation.upsert({
    where: { orgId_email: { orgId: admin.orgId, email } },
    update: data,
    create: { ...data, orgId: admin.orgId, email },
  });
  // A user who already has an account (e.g. in another company) joins right away.
  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.emailVerifiedAt) await syncMemberships(existing.id, email);

  const portalUrl = process.env.AUTH_URL ?? "http://localhost:3000";
  await sendMail(
    email,
    `คำเชิญเข้าใช้ ${admin.org.name} Workspace`,
    `${admin.user.name ?? admin.user.email} เชิญคุณเข้าใช้ ${admin.org.name} Workspace\n\nเข้าสู่ระบบด้วย Google / Microsoft ที่ใช้อีเมลนี้ หรือตั้งรหัสผ่านได้ที่ ${portalUrl}${orgPath(admin.org.slug, "/login/password")}`,
  );
  revalidatePath("/", "layout");
  return { ok: `ส่งคำเชิญถึง ${email} แล้ว` };
}

export async function revokeInvitation(slug: string, id: string) {
  const admin = await requireAdmin(slug);
  await db.invitation.deleteMany({ where: { id, orgId: admin.orgId, acceptedAt: null } });
  revalidatePath("/", "layout");
}

export async function removeMember(slug: string, membershipId: string) {
  const admin = await requireAdmin(slug);
  if (membershipId === admin.id) return; // admins cannot remove themselves
  const target = await db.membership.findFirst({ where: { id: membershipId, orgId: admin.orgId }, include: { user: true } });
  if (!target) return;
  await db.$transaction([
    db.membership.delete({ where: { id: target.id } }),
    // Otherwise the next sign-in would accept the old invitation again.
    db.invitation.deleteMany({ where: { orgId: admin.orgId, email: target.user.email } }),
    db.accountLink.deleteMany({ where: { orgId: admin.orgId, userId: target.userId } }),
  ]);
  revalidatePath("/", "layout");
}

export async function switchOrg(form: FormData) {
  const user = await requireUser();
  const member = await db.membership.findFirst({
    where: { userId: user.id, orgId: String(form.get("orgId") ?? "") },
    select: { org: { select: { slug: true } } },
  });
  redirect(member ? orgPath(member.org.slug) : "/");
}

/** Signs out and returns to the company login page (or the global one). */
export async function logout(slug: string | null) {
  await signOut({ redirectTo: slug ? orgPath(slug, "/login") : "/" });
}
