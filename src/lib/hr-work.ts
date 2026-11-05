import type { AccountLink } from "@prisma/client";
import type { Member } from "@/lib/context";
import { db } from "@/lib/db";
import { hrCustomer, hrDatabases, hrEmployeeId, hrPendingApprovals, type HrApproval } from "@/lib/hr";

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
  const customer = hrCustomer(hrBaseUrl);
  const hit = captions.get(customer);
  if (hit && Date.now() - hit.at < CAPTION_MS) return hit.value;
  try {
    const value = new Map((await hrDatabases(customer)).map((d) => [d.name, d.caption]));
    captions.set(customer, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.error("[hr] database list failed:", err);
    return new Map();
  }
}

async function approvalsFor(link: AccountLink): Promise<HrApproval[]> {
  const hit = cache.get(link.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let employeeId = link.externalRef;
  if (!employeeId) {
    employeeId = await hrEmployeeId(link.externalUserId);
    if (!employeeId) return [];
    await db.accountLink.update({ where: { id: link.id }, data: { externalRef: employeeId } });
  }
  const value = await hrPendingApprovals(link.externalUserId, employeeId);
  cache.set(link.id, { at: Date.now(), value });
  return value;
}

/**
 * Leave / OT requests waiting for the member's approval, across every HR database they linked,
 * or null when HR isn't connected, the member hasn't linked an HR account, or no database answered.
 */
export async function getHrApprovals(member: Member): Promise<HrApproval[] | null> {
  if (!member.org.hrEnabled || !member.org.hrBaseUrl) return null;
  const links = await hrLinks(member);
  if (!links.length) return null;
  const results = await Promise.allSettled(links.map(approvalsFor));
  const ok = results.flatMap((r, i) => {
    if (r.status === "fulfilled") return [r.value];
    console.error(`[hr] approvals failed (${links[i].externalDb}):`, r.reason);
    return [];
  });
  return ok.length ? ok.flat() : null;
}
