import { z } from "zod";
import { db } from "@/lib/db";
import { hubGroups, hubGroupsEnabled } from "@/lib/hub";
import { fromThisServer } from "@/lib/local-call";

/**
 * POST /api/notify/groups { "email": "a@acme.com" }: the LINE / Telegram groups of every company the
 * person belongs to, for Task's Automation "Send to group" picker. Same-server calls only.
 *
 *   { enabled: true, groups: [{ org: "acme", orgName: "Acme", groupId: "grp_…", name: "ทีมซ่อม", channel: "line", status: "connected", memberCount: 18 }] }
 *   enabled: false until HUB_GROUPS_ENABLED=1 (the Hub's group API).
 */
const Body = z.object({ email: z.string().trim().toLowerCase().min(3).max(254) });

export async function POST(req: Request) {
  const refused = await fromThisServer(req);
  if (refused) return refused;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation", message: parsed.error.message }, { status: 400 });
  if (!hubGroupsEnabled()) return Response.json({ enabled: false, groups: [] });

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    include: { memberships: { include: { org: { select: { slug: true, name: true } } }, orderBy: { createdAt: "asc" } } },
  });
  const groups = [];
  for (const m of user?.memberships ?? []) {
    try {
      for (const g of await hubGroups(m.org.slug)) {
        groups.push({ org: m.org.slug, orgName: m.org.name, groupId: g.groupId, name: g.name, channel: g.channel, status: g.status, memberCount: g.memberCount });
      }
    } catch (err) {
      console.error(`[notify/groups] Hub groups for ${m.org.slug} failed:`, err);
    }
  }
  return Response.json({ enabled: true, groups });
}
