import type { Member } from "@/lib/context";
import { db } from "@/lib/db";
import { hrEmployeeId, hrPendingApprovals, type HrApproval } from "@/lib/hr";

// Same short per-member cache as lib/task.ts: home and My Work ask on the same visit.
const cache = new Map<string, { at: number; value: HrApproval[] }>();
const CACHE_MS = 20_000;

/**
 * Leave / OT requests waiting for the member's approval in HR, or null when HR isn't connected,
 * the member hasn't linked their HR account, or HR can't be reached.
 */
export async function getHrApprovals(member: Member): Promise<HrApproval[] | null> {
  if (!member.org.hrEnabled || !member.org.hrBaseUrl) return null;
  const link = await db.accountLink.findUnique({
    where: { orgId_userId_system: { orgId: member.orgId, userId: member.userId, system: "HR" } },
  });
  if (!link) return null;
  const hit = cache.get(link.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    let employeeId = link.externalRef;
    if (!employeeId) {
      employeeId = await hrEmployeeId(link.externalUserId);
      if (!employeeId) return [];
      await db.accountLink.update({ where: { id: link.id }, data: { externalRef: employeeId } });
    }
    const value = await hrPendingApprovals(link.externalUserId, employeeId);
    cache.set(link.id, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.error("[hr] approvals failed:", err);
    return null;
  }
}
