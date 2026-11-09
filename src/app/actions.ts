"use server";

// Tenant actions take the org slug explicitly (bound argument, or the hidden "org" form field)
// and re-check membership for that org, so a request can never act on a company you don't belong to.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { orgPath, requireAdmin, requireMember, requireUser, slugFrom } from "@/lib/context";
import { normalizeEmail, syncMemberships } from "@/lib/identity";
import { sendMail } from "@/lib/mail";
import { readNewsUploads } from "@/lib/news-files";
import { CHANNELS, getDepartments, getQuickEntries, newsWhere, parseBangkokInput, pinnedEntries, safeHttpsUrl, SERVICE_ICONS } from "@/lib/portal";
import { getTaskProjects } from "@/lib/task";

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

function parseNews(form: FormData) {
  return newsSchema.safeParse({
    title: form.get("title"),
    body: form.get("body"),
    channel: form.get("channel"),
    audience: form.get("audience"),
  });
}

const TX_OPTIONS = { timeout: 60_000 };
const NEWS_INPUT_ERROR = "กรุณากรอกหัวข้อ เนื้อหา และเลือก Channel กับกลุ่มผู้รับให้ถูกต้อง";

async function validAudience(orgId: string, audience: string) {
  return audience === "all" || audience in (await getDepartments(orgId));
}

export async function createNews(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(slugFrom(form));
  const parsed = parseNews(form);
  if (!parsed.success || !(await validAudience(admin.orgId, parsed.data.audience))) return { error: NEWS_INPUT_ERROR };

  const publishAt = parseBangkokInput(form.get("publishAt"));
  const expiresAt = parseBangkokInput(form.get("expiresAt"));
  if (publishAt === undefined || expiresAt === undefined) return { error: "วันเวลาไม่ถูกต้อง" };
  const now = new Date();
  const publishedAt = publishAt && publishAt > now ? publishAt : now;
  if (expiresAt && expiresAt <= publishedAt) return { error: "วันหมดอายุต้องอยู่หลังวันเผยแพร่" };

  const uploads = await readNewsUploads(form, 0);
  if ("error" in uploads) return uploads;

  await db.$transaction(async (tx) => {
    const news = await tx.news.create({
      data: {
        ...parsed.data,
        orgId: admin.orgId,
        requiresAck: form.get("requiresAck") === "on",
        notifyEmail: form.get("notifyEmail") === "on",
        authorName: admin.user.name ?? admin.user.email,
        publishedAt,
        expiresAt,
      },
    });
    // One insert per file: a single statement holding every file could exceed MariaDB's max_allowed_packet.
    for (const file of uploads.files) await tx.newsAttachment.create({ data: { ...file, newsId: news.id } });
  }, TX_OPTIONS);
  revalidatePath("/", "layout");
  return { ok: publishedAt > now ? "ตั้งเวลาเผยแพร่แล้ว" : "เผยแพร่ใน Portal แล้ว" };
}

/** Browsers submit textarea line breaks as CRLF, so compare text with line endings normalized. */
const sameText = (a: string, b: string) => a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");

/** Changing the title, body or files of a live post clears every acknowledgement, so people must acknowledge the new content. */
export async function updateNews(_: FormState, form: FormData): Promise<FormState> {
  const slug = slugFrom(form);
  const admin = await requireAdmin(slug);
  const parsed = parseNews(form);
  if (!parsed.success || !(await validAudience(admin.orgId, parsed.data.audience))) return { error: NEWS_INPUT_ERROR };
  const news = await db.news.findFirst({
    where: { id: String(form.get("id") ?? ""), orgId: admin.orgId },
    include: { attachments: { select: { id: true } } },
  });
  if (!news) return { error: "ไม่พบประกาศนี้ อาจถูกลบไปแล้ว" };

  const now = new Date();
  const wasLive = news.publishedAt <= now;
  const publishAt = parseBangkokInput(form.get("publishAt"));
  const expiresAt = parseBangkokInput(form.get("expiresAt"));
  if (publishAt === undefined || expiresAt === undefined) return { error: "วันเวลาไม่ถูกต้อง" };
  // A live post keeps its publish date (the form doesn't offer it); a scheduled one can move, or go out now when cleared.
  const publishedAt = wasLive ? news.publishedAt : publishAt && publishAt > now ? publishAt : now;
  if (expiresAt && expiresAt <= publishedAt) return { error: "วันหมดอายุต้องอยู่หลังวันเผยแพร่" };

  const removeIds = form.getAll("removeFile").map(String).filter((id) => news.attachments.some((a) => a.id === id));
  const uploads = await readNewsUploads(form, news.attachments.length - removeIds.length);
  if ("error" in uploads) return uploads;

  const textChanged = !sameText(news.title, parsed.data.title) || !sameText(news.body, parsed.data.body);
  const contentChanged = textChanged || removeIds.length > 0 || uploads.files.length > 0;
  const editedLive = wasLive && contentChanged;
  const notify = form.get("notifyEmail") === "on";

  await db.$transaction(async (tx) => {
    await tx.news.update({
      where: { id: news.id },
      data: {
        ...parsed.data,
        requiresAck: form.get("requiresAck") === "on",
        publishedAt,
        expiresAt,
        ...(editedLive ? { editedAt: now } : {}),
        // Not out yet: the checkbox decides. Already out: only a real edit sends another email.
        ...(!wasLive ? { notifyEmail: notify, notifiedAt: null } : editedLive && notify ? { notifyEmail: true, notifiedAt: null } : {}),
      },
    });
    if (removeIds.length) await tx.newsAttachment.deleteMany({ where: { id: { in: removeIds }, newsId: news.id } });
    for (const file of uploads.files) await tx.newsAttachment.create({ data: { ...file, newsId: news.id } });
    if (editedLive) await tx.newsAck.deleteMany({ where: { newsId: news.id } });
  }, TX_OPTIONS);
  revalidatePath("/", "layout");
  redirect(orgPath(slug, "/admin?tab=news"));
}

export async function deleteNews(slug: string, id: string) {
  const admin = await requireAdmin(slug);
  await db.news.deleteMany({ where: { id, orgId: admin.orgId } });
  revalidatePath("/", "layout");
}

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(120),
  icon: z.string().refine((i) => i in SERVICE_ICONS),
  project: z.string().regex(/^[^|]+\|[^|]+$/),
  openMode: z.enum(["board", "form"]),
  audience: z.string().trim().min(1).max(40),
});

/** Maps a Portal service to a Task project the admin can see in Task. */
export async function createService(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(slugFrom(form));
  const parsed = serviceSchema.safeParse({
    name: form.get("name"),
    description: form.get("description") ?? "",
    icon: form.get("icon"),
    project: form.get("project"),
    openMode: form.get("openMode"),
    audience: form.get("audience"),
  });
  if (!parsed.success || !(await validAudience(admin.orgId, parsed.data.audience))) return { error: "กรอกชื่อบริการ และเลือก Project ใน Task" };
  const [workspaceId, projectId] = parsed.data.project.split("|");
  const workspaces = await getTaskProjects(admin);
  if (!workspaces) return { error: "ติดต่อ TaskExcellence ไม่ได้ ลองใหม่อีกครั้ง" };
  const ws = workspaces.find((w) => w.id === workspaceId);
  const project = ws?.projects.find((p) => p.id === projectId);
  if (!ws || !project) return { error: "ไม่พบ Project นี้ใน Task หรือคุณไม่มีสิทธิ์" };
  const { name, description, icon, openMode, audience } = parsed.data;
  await db.service.create({
    data: {
      name,
      description: description || null,
      icon,
      openMode,
      audience,
      orgId: admin.orgId,
      taskWorkspaceId: workspaceId,
      taskProjectId: projectId,
      taskLabel: `${ws.name} › ${project.name}`,
      sortOrder: await db.service.count({ where: { orgId: admin.orgId } }),
    },
  });
  revalidatePath("/", "layout");
  return { ok: "เพิ่มบริการแล้ว" };
}

export async function deleteService(slug: string, id: string) {
  const admin = await requireAdmin(slug);
  await db.service.deleteMany({ where: { id, orgId: admin.orgId } });
  revalidatePath("/", "layout");
}

export async function setSystemConnected(slug: string, system: "hr" | "task", connected: boolean) {
  const admin = await requireAdmin(slug);
  const data = system === "hr" ? { hrEnabled: connected } : { taskEnabled: connected };
  await db.org.update({ where: { id: admin.orgId }, data });
  revalidatePath("/", "layout");
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

export async function setMemberDepartment(slug: string, membershipId: string, form: FormData) {
  const admin = await requireAdmin(slug);
  const department = String(form.get("department") ?? "");
  if (department && !(department in (await getDepartments(admin.orgId)))) return;
  await db.membership.updateMany({ where: { id: membershipId, orgId: admin.orgId }, data: { department: department || null } });
  revalidatePath("/", "layout");
}

const departmentName = z.string().trim().min(1).max(60);

async function departmentNameTaken(orgId: string, name: string, exceptKey?: string) {
  const found = await db.department.findUnique({ where: { orgId_name: { orgId, name } } });
  return !!found && found.key !== exceptKey;
}

export async function createDepartment(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin(slugFrom(form));
  const name = departmentName.safeParse(form.get("name"));
  if (!name.success) return { error: "กรุณากรอกชื่อแผนก (ไม่เกิน 60 ตัวอักษร)" };
  if (await departmentNameTaken(admin.orgId, name.data)) return { error: "มีแผนกชื่อนี้แล้ว" };
  await db.department.create({ data: { orgId: admin.orgId, key: `d${randomBytes(5).toString("hex")}`, name: name.data } });
  revalidatePath("/", "layout");
  return { ok: `เพิ่มแผนก ${name.data} แล้ว` };
}

export async function renameDepartment(_: FormState, form: FormData): Promise<FormState> {
  const slug = slugFrom(form);
  const admin = await requireAdmin(slug);
  const key = String(form.get("key") ?? "");
  const name = departmentName.safeParse(form.get("name"));
  if (!name.success) return { error: "กรุณากรอกชื่อแผนก (ไม่เกิน 60 ตัวอักษร)" };
  if (await departmentNameTaken(admin.orgId, name.data, key)) return { error: "มีแผนกชื่อนี้แล้ว" };
  await db.department.updateMany({ where: { orgId: admin.orgId, key }, data: { name: name.data } });
  revalidatePath("/", "layout");
  redirect(orgPath(slug, "/admin?tab=departments"));
}

/** Members and pending invitations fall back to "no department"; a department that news or services still target can't go. */
export async function deleteDepartment(slug: string, key: string) {
  const admin = await requireAdmin(slug);
  const where = { orgId: admin.orgId, audience: key };
  if ((await db.news.count({ where })) + (await db.service.count({ where })) > 0) return;
  await db.$transaction([
    db.membership.updateMany({ where: { orgId: admin.orgId, department: key }, data: { department: null } }),
    db.invitation.updateMany({ where: { orgId: admin.orgId, department: key }, data: { department: null } }),
    db.department.deleteMany({ where: { orgId: admin.orgId, key } }),
  ]);
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
  if (parsed.data.department && !(parsed.data.department in (await getDepartments(admin.orgId)))) return { error: "ไม่พบแผนกนี้" };
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
