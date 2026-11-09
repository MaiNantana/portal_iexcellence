import type { AccountLink } from "@prisma/client";
import type { Member } from "@/lib/context";
import { db } from "@/lib/db";
import { hrDatabases, hrEmployeeId, hrLeaveQuota, hrPayPeriods, hrPendingApprovals, type HrApproval, type HrLeaveQuota, type HrPayPeriod } from "@/lib/hr";

// Same short per-member cache as lib/task.ts: home and My Work ask on the same visit.
const cache = new Map<string, { at: number; value: HrApproval[] }>();
const CACHE_MS = 20_000;

/** The member's HR accounts, one per HR database, in the order they were linked. */
export function hrLinks(member: Member) {
  return db.accountLink.findMany({
    where: { orgId: member.orgId, userId: member.userId, system: "HR" },
    orderBy: { linkedAt: "asc" },
  });
}

// Database captions change rarely; keep them a while so every page doesn't ask HR.
const captions = new Map<string, { at: number; value: Map<string, string> }>();
const CAPTION_MS = 10 * 60_000;

/** Database name → caption ("ixcl_hr" → "บริษัท ไอเอ็กซ์ เซลเลนซ์") for the company's HR URL; names stand in when HR is unreachable. */
export async function hrDbCaptions(hrBaseUrl: string): Promise<Map<string, string>> {
  const hit = captions.get(hrBaseUrl);
  if (hit && Date.now() - hit.at < CAPTION_MS) return hit.value;
  try {
    const value = new Map((await hrDatabases(hrBaseUrl)).map((d) => [d.name, d.caption]));
    captions.set(hrBaseUrl, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.error("[hr] database list failed:", err);
    return new Map();
  }
}

/** The link's EMPLOYEE_ID, looked up once and remembered; null for an HR login with no employee. */
async function linkedEmployeeId(hrBaseUrl: string, link: AccountLink) {
  if (link.externalRef) return link.externalRef;
  const employeeId = await hrEmployeeId(hrBaseUrl, link.externalUserId);
  if (employeeId) await db.accountLink.update({ where: { id: link.id }, data: { externalRef: employeeId } });
  return employeeId;
}

async function approvalsFor(hrBaseUrl: string, link: AccountLink): Promise<HrApproval[]> {
  const hit = cache.get(link.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const employeeId = await linkedEmployeeId(hrBaseUrl, link);
  if (!employeeId) return [];
  const value = await hrPendingApprovals(hrBaseUrl, link.externalUserId, employeeId);
  cache.set(link.id, { at: Date.now(), value });
  return value;
}

/**
 * Leave / OT requests waiting for the member's approval, across every HR database they linked,
 * or null when HR isn't connected, the member hasn't linked an HR account, or no database answered.
 */
export async function getHrApprovals(member: Member): Promise<HrApproval[] | null> {
  const { hrEnabled, hrBaseUrl } = member.org;
  if (!hrEnabled || !hrBaseUrl) return null;
  const links = await hrLinks(member);
  if (!links.length) return null;
  const results = await Promise.allSettled(links.map((l) => approvalsFor(hrBaseUrl, l)));
  const ok = results.flatMap((r, i) => {
    if (r.status === "fulfilled") return [r.value];
    console.error(`[hr] approvals failed (${links[i].externalDb}):`, r.reason);
    return [];
  });
  return ok.length ? ok.flat() : null;
}

export type HrSnapshot = { db: string; leave: HrLeaveQuota[]; lastSlip: HrPayPeriod | null };

const snapshots = new Map<string, { at: number; value: HrSnapshot }>();
const SNAPSHOT_MS = 60_000;

function bangkokYear() {
  return Number(new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date()));
}

function latestPeriod(periods: HrPayPeriod[]) {
  return periods.reduce<HrPayPeriod | null>((best, p) => (!best || Date.parse(p.end) > Date.parse(best.end) ? p : best), null);
}

async function snapshotFor(hrBaseUrl: string, link: AccountLink): Promise<HrSnapshot | null> {
  const hit = snapshots.get(link.id);
  if (hit && Date.now() - hit.at < SNAPSHOT_MS) return hit.value;
  const employeeId = await linkedEmployeeId(hrBaseUrl, link);
  if (!employeeId) return null;
  const year = bangkokYear();
  const [leave, thisYear] = await Promise.all([
    hrLeaveQuota(hrBaseUrl, link.externalUserId, employeeId, year),
    hrPayPeriods(hrBaseUrl, link.externalUserId, employeeId, year),
  ]);
  // Early in the year the latest closed slip can still be last year's.
  const periods = thisYear.length ? thisYear : await hrPayPeriods(hrBaseUrl, link.externalUserId, employeeId, year - 1);
  const value = { db: link.externalDb, leave: leave.filter((l) => l.quota > 0), lastSlip: latestPeriod(periods) };
  snapshots.set(link.id, { at: Date.now(), value });
  return value;
}

/** The member's own leave balance and latest payslip period; null when HR isn't connected, accounts: [] when HR didn't answer. */
export async function getHrSnapshot(member: Member): Promise<{ linked: boolean; accounts: HrSnapshot[] } | null> {
  const { hrEnabled, hrBaseUrl } = member.org;
  if (!hrEnabled || !hrBaseUrl) return null;
  const links = await hrLinks(member);
  if (!links.length) return { linked: false, accounts: [] };
  const results = await Promise.allSettled(links.map((l) => snapshotFor(hrBaseUrl, l)));
  const accounts = results.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value ? [r.value] : [];
    console.error(`[hr] snapshot failed (${links[i].externalDb}):`, r.reason);
    return [];
  });
  return { linked: true, accounts };
}
