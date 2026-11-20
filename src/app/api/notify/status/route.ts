import { z } from "zod";
import { db } from "@/lib/db";
import { discordConfigured } from "@/lib/discord";
import { HUB_CHANNELS, hubConfigured, hubUserChannels } from "@/lib/hub";
import { fromThisServer } from "@/lib/local-call";

/**
 * POST /api/notify/status { "email": "a@acme.com", "org"?: "acme" }: which notification channels a person
 * has linked, for other apps to show (Task's My Account › Notifications). Same-server calls only.
 * The company is the one /api/notify would use: `org`, else the one the person used last.
 *
 *   { member: true, primary: "line", channels: { line: "connected", telegram: "not_linked", discord: "off" } }
 *   channel status: connected | blocked | not_linked | off (not enabled on this Portal) | error (Hub unreachable)
 */
const Body = z.object({ email: z.string().trim().toLowerCase().min(3).max(254), org: z.string().trim().max(64).optional() });

export async function POST(req: Request) {
  const refused = await fromThisServer(req);
  if (refused) return refused;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation", message: parsed.error.message }, { status: 400 });
  const { email, org: slug } = parsed.data;

  const user = await db.user.findUnique({
    where: { email },
    include: { discord: true, memberships: { include: { org: { select: { slug: true } } }, orderBy: { createdAt: "asc" } } },
  });
  const ms = slug ? (user?.memberships ?? []).filter((m) => m.org.slug === slug) : (user?.memberships ?? []);
  const member = ms.find((m) => m.orgId === user?.lastOrgId) ?? ms[0];
  if (!user || !member) return Response.json({ member: false, primary: null, channels: {} });

  const channels: Record<string, string> = {};
  let primary: string | null = null;
  if (!hubConfigured()) for (const c of HUB_CHANNELS) channels[c] = "off";
  else {
    try {
      const hub = await hubUserChannels(member.org.slug, user.id);
      primary = hub.primary;
      for (const c of new Set([...HUB_CHANNELS, ...Object.keys(hub.channels ?? {})])) channels[c] = hub.channels?.[c]?.status ?? "not_linked";
    } catch (err) {
      console.error("[notify/status] Hub failed:", err);
      for (const c of HUB_CHANNELS) channels[c] = "error";
    }
  }
  channels.discord = !discordConfigured() ? "off" : user.discord ? "connected" : "not_linked";
  return Response.json({ member: true, company: member.org.slug, primary, channels });
}
