import { z } from "zod";
import { db } from "@/lib/db";
import { companyGroups } from "@/lib/groups";
import { fromThisServer } from "@/lib/local-call";

/**
 * POST /api/notify/groups { "email": "a@acme.com" }: the notification groups (LINE groups and Discord
 * channels) of every company the person belongs to, for Task's Automation "Send to group" picker.
 * A company can have any number of each. Same-server calls only.
 *
 *   { enabled: true, groups: [{ org: "acme", orgName: "Acme", groupId: "C…" | "dsc_…", name: "ทีมซ่อม", channel: "line" | "discord", status: "connected" | "left" }] }
 */
const Body = z.object({ email: z.string().trim().toLowerCase().min(3).max(254) });

export async function POST(req: Request) {
  const refused = await fromThisServer(req);
  if (refused) return refused;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation", message: parsed.error.message }, { status: 400 });

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    include: { memberships: { include: { org: { select: { id: true, slug: true, name: true } } }, orderBy: { createdAt: "asc" } } },
  });
  const groups = [];
  for (const m of user?.memberships ?? []) {
    const { groups: list } = await companyGroups(m.org);
    for (const g of list) groups.push({ org: m.org.slug, orgName: m.org.name, ...g });
  }
  return Response.json({ enabled: true, groups });
}
