import type { AppLink, News } from "@prisma/client";
import { db } from "@/lib/db";
import type { Member } from "@/lib/context";

export const CHANNELS: Record<string, string> = {
  company: "ประกาศบริษัท",
  hr: "ฝ่ายบุคคล",
  it: "ฝ่าย IT",
  events: "กิจกรรม",
  production: "ฝ่ายผลิต",
};

export const DEPARTMENTS: Record<string, string> = {
  hr: "ฝ่ายบุคคล",
  it: "ฝ่าย IT",
  production: "ฝ่ายผลิต",
};

export function channelLabel(channel: string) {
  return CHANNELS[channel] ?? channel;
}

export function formatThaiDate(d: Date) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(d);
}

/** HTTPS-only (plus http://localhost outside production, for local HR/Task), and returns the normalized href or null. */
export function safeHttpsUrl(raw: string | null | undefined) {
  try {
    const u = new URL(String(raw ?? "").trim());
    const devLocal = process.env.NODE_ENV !== "production" && u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
    return (u.protocol === "https:" && u.hostname.includes(".")) || devLocal ? u.href : null;
  } catch {
    return null;
  }
}

/** TaskExcellence is one shared system for every company, so its URLs are server config, not per-company settings. */
export const TASK_BASE_URL = process.env.TASK_BASE_URL || "https://pmo.iexcellence.cloud/";
export const TASK_API_URL = process.env.TASK_API_URL || "https://pmo.iexcellence.cloud:8443";

/** Admins see every post; everyone else sees company-wide posts plus their department's. */
export function newsWhere(member: Member) {
  return member.role === "ADMIN"
    ? { orgId: member.orgId }
    : { orgId: member.orgId, audience: { in: ["all", member.department ?? "all"] } };
}

export async function getVisibleNews(member: Member) {
  const news = await db.news.findMany({ where: newsWhere(member), orderBy: { publishedAt: "desc" } });
  const acks = await db.newsAck.findMany({
    where: { userId: member.userId, newsId: { in: news.map((n) => n.id) } },
    select: { newsId: true },
  });
  const acked = new Set(acks.map((a) => a.newsId));
  return { news, acked, pending: news.filter((n) => n.requiresAck && !acked.has(n.id)) };
}

export type QuickEntry = {
  key: string;
  kind: "hr" | "task" | "company" | "personal";
  name: string;
  desc: string;
  url: string;
  icon: string;
  linkId?: string;
};

/** Everything this member may launch: connected systems, company links and their own personal links. */
export async function getQuickEntries(member: Member): Promise<QuickEntry[]> {
  const { org } = member;
  const links = await db.appLink.findMany({
    where: {
      orgId: org.id,
      OR: [{ visibility: "COMPANY" }, { visibility: "PERSONAL", ownerId: member.userId }],
    },
    orderBy: { createdAt: "asc" },
  });
  const entries: QuickEntry[] = [];
  if (org.hrEnabled && org.hrBaseUrl) {
    entries.push({ key: "sys:hr", kind: "hr", name: "HR Excellence", desc: "ลงเวลา · ลา · เงินเดือน", url: `/${org.slug}/go/hr`, icon: "◷" });
  }
  if (org.taskEnabled) {
    // Through the Portal so the user is signed in to Task automatically.
    entries.push({ key: "sys:task", kind: "task", name: "TaskExcellence", desc: "งานของฉัน · อนุมัติ · Project", url: `/${org.slug}/go/task`, icon: "☑" });
  }
  for (const l of links) entries.push(linkEntry(l));
  return entries;
}

function linkEntry(l: AppLink): QuickEntry {
  const personal = l.visibility === "PERSONAL";
  return {
    key: `app:${l.id}`,
    kind: personal ? "personal" : "company",
    name: l.name,
    desc: personal ? "ลิงก์ส่วนตัว" : l.url,
    url: l.url,
    icon: personal ? "☆" : "↗",
    linkId: l.id,
  };
}

/** Pins in the member's order; first-time users get sensible defaults until they customize. */
export function pinnedEntries(member: Member, entries: QuickEntry[]) {
  const saved = Array.isArray(member.pins) ? member.pins.filter((k): k is string => typeof k === "string") : [];
  const keys = member.pinsCustomized
    ? saved
    : [...entries.filter((e) => e.kind === "hr" || e.kind === "task"), ...entries.filter((e) => e.kind === "company").slice(0, 2)].map((e) => e.key);
  const byKey = new Map(entries.map((e) => [e.key, e]));
  return keys.map((k) => byKey.get(k)).filter((e): e is QuickEntry => !!e);
}

export type NewsItem = Pick<News, "id" | "title" | "body" | "channel" | "requiresAck"> & { date: string; acked: boolean };

export function toNewsItem(n: News, acked: Set<string>): NewsItem {
  return { id: n.id, title: n.title, body: n.body, channel: n.channel, requiresAck: n.requiresAck, date: formatThaiDate(n.publishedAt), acked: acked.has(n.id) };
}

/** DNS name where an org publishes its domain-verification TXT token. */
export function domainTxtName(domain: string) {
  return `_iexcellence.${domain}`;
}
