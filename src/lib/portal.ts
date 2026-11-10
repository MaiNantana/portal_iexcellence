import type { AppLink, News, Service } from "@prisma/client";
import { cache } from "react";
import { db } from "@/lib/db";
import type { Member } from "@/lib/context";

export const CHANNELS: Record<string, string> = {
  company: "ประกาศบริษัท",
  hr: "ฝ่ายบุคคล",
  it: "ฝ่าย IT",
  events: "กิจกรรม",
  production: "ฝ่ายผลิต",
};

/** The company's departments (key → name), once per request. */
export const getDepartments = cache(async (orgId: string): Promise<Record<string, string>> => {
  const rows = await db.department.findMany({ where: { orgId }, orderBy: { name: "asc" } });
  return Object.fromEntries(rows.map((d) => [d.key, d.name]));
});

export function channelLabel(channel: string) {
  return CHANNELS[channel] ?? channel;
}

/** "2026-11-09T14:30" as Bangkok time (a datetime-local value): null when blank, undefined when invalid. */
export function parseBangkokInput(raw: FormDataEntryValue | null): Date | null | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** A date as a datetime-local value in Bangkok time. */
export function toBangkokInput(d: Date | null | undefined) {
  return d ? new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 16) : "";
}

export function formatThaiDateTime(d: Date) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(d);
}

/**
 * A date string from Task or HR. HR's MySQL DATETIME arrives without a zone and is Thai time, so a date-time
 * without one is read as +07:00 (the server itself may run in UTC). Null when missing or unparsable.
 */
export function parseApiDate(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? `${s}+07:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A due date with its time, or the date alone when it has no time of day (a bare date, or midnight Thai time). */
export function formatDue(s: string) {
  const d = parseApiDate(s);
  if (!d) return s;
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Bangkok" }).format(d);
  return /T\d{2}:\d{2}/.test(s) && time !== "00:00" ? `${formatThaiDateTime(d)} น.` : formatThaiDate(d);
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

/** Live posts only (not scheduled for later, not expired). Admins see every audience; everyone else company-wide posts plus their department's. */
export function newsWhere(member: Member) {
  const now = new Date();
  return {
    orgId: member.orgId,
    publishedAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    ...(member.role === "ADMIN" ? {} : { audience: { in: ["all", member.department ?? "all"] } }),
  };
}

export async function getVisibleNews(member: Member) {
  const news = await db.news.findMany({
    where: newsWhere(member),
    orderBy: { publishedAt: "desc" },
    include: { _count: { select: { attachments: true } } },
  });
  const acks = await db.newsAck.findMany({
    where: { userId: member.userId, newsId: { in: news.map((n) => n.id) } },
    select: { newsId: true },
  });
  const acked = new Set(acks.map((a) => a.newsId));
  return { news, acked, pending: news.filter((n) => n.requiresAck && !acked.has(n.id)) };
}

export type QuickEntry = {
  key: string;
  kind: "hr" | "task" | "service" | "company" | "personal";
  name: string;
  desc: string;
  url: string;
  icon: string;
  linkId?: string;
};

/** Icons a company service can use (key → glyph for the admin's dropdown); the key is what's stored and what AppIcon draws. */
export const SERVICE_ICONS: Record<string, string> = {
  wrench: "🔧",
  folder: "📁",
  document: "📄",
  quote: "🧾",
  money: "💰",
  cart: "🛒",
  truck: "🚚",
  people: "👥",
  calendar: "📅",
  chart: "📊",
};

/** Company services this member may use: everyone's, plus their department's. */
export async function getVisibleServices(member: Member) {
  if (!member.org.taskEnabled) return [];
  return db.service.findMany({
    where: { orgId: member.orgId, ...(member.role === "ADMIN" ? {} : { audience: { in: ["all", member.department ?? "all"] } }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** Everything this member may launch: connected systems, company services, company links and their own personal links. */
export async function getQuickEntries(member: Member): Promise<QuickEntry[]> {
  const { org } = member;
  const [links, services] = await Promise.all([
    db.appLink.findMany({
      where: {
        orgId: org.id,
        OR: [{ visibility: "COMPANY" }, { visibility: "PERSONAL", ownerId: member.userId }],
      },
      orderBy: { createdAt: "asc" },
    }),
    getVisibleServices(member),
  ]);
  const entries: QuickEntry[] = [];
  if (org.hrEnabled && org.hrBaseUrl) {
    entries.push({ key: "sys:hr", kind: "hr", name: "HR Excellence", desc: "ลงเวลา · ลา · เงินเดือน", url: `/${org.slug}/go/hr`, icon: "hr" });
  }
  if (org.taskEnabled) {
    // Through the Portal so the user is signed in to Task automatically.
    entries.push({ key: "sys:task", kind: "task", name: "TaskExcellence", desc: "งานของฉัน · อนุมัติ · Project", url: `/${org.slug}/go/task`, icon: "task" });
  }
  for (const s of services) entries.push(serviceEntry(org.slug, s));
  for (const l of links) entries.push(linkEntry(l));
  return entries;
}

function serviceEntry(slug: string, s: Service): QuickEntry {
  return {
    key: `svc:${s.id}`,
    kind: "service",
    name: s.name,
    desc: s.description || s.taskLabel,
    url: `/${slug}/go/service/${s.id}`,
    icon: s.icon,
  };
}

function linkEntry(l: AppLink): QuickEntry {
  const personal = l.visibility === "PERSONAL";
  return {
    key: `app:${l.id}`,
    kind: personal ? "personal" : "company",
    name: l.name,
    desc: personal ? "ลิงก์ส่วนตัว" : l.url,
    url: l.url,
    icon: personal ? "personal" : "company",
    linkId: l.id,
  };
}

/** Pins in the member's order; first-time users get sensible defaults until they customize. */
export function pinnedEntries(member: Member, entries: QuickEntry[]) {
  const saved = Array.isArray(member.pins) ? member.pins.filter((k): k is string => typeof k === "string") : [];
  const keys = member.pinsCustomized
    ? saved
    : [
        ...entries.filter((e) => e.kind === "hr" || e.kind === "task" || e.kind === "service"),
        ...entries.filter((e) => e.kind === "company").slice(0, 2),
      ].map((e) => e.key);
  const byKey = new Map(entries.map((e) => [e.key, e]));
  return keys.map((k) => byKey.get(k)).filter((e): e is QuickEntry => !!e);
}

export type NewsItem = Pick<News, "id" | "title" | "body" | "channel" | "requiresAck"> & { date: string; acked: boolean; edited: boolean; hasFiles: boolean };

export function toNewsItem(n: News & { _count: { attachments: number } }, acked: Set<string>): NewsItem {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    channel: n.channel,
    requiresAck: n.requiresAck,
    date: formatThaiDate(n.editedAt ?? n.publishedAt),
    acked: acked.has(n.id),
    edited: n.editedAt !== null,
    hasFiles: n._count.attachments > 0,
  };
}

/** DNS name where an org publishes its domain-verification TXT token. */
export function domainTxtName(domain: string) {
  return `_iexcellence.${domain}`;
}
