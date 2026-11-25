import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendToGroups } from "@/lib/groups";
import { fromThisServer } from "@/lib/local-call";

/**
 * POST /api/notify/groups/send { "email": "a@acme.com", "org": "acme", "groupIds": ["C…", "dsc_…"], "text": "…" }
 * Task's Automation "Send to group" (LINE group or Discord channel). `email` is who triggered it: they
 * must be a member of `org`, and only that company's groups are sent to. Same-server calls only.
 * Optional header Idempotency-Key (same key = no duplicate).
 *
 *   { groups: [{ group: "C…" | "dsc_…", channel: "line" | "discord", status: "sent" | "left" | "not_found" | "failed" }] }
 */
const Body = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254),
  org: z.string().trim().min(1).max(64),
  groupIds: z.array(z.string().trim().min(1).max(128)).min(1).max(20),
  text: z.string().trim().min(1).max(4900),
  ref: z.string().trim().max(128).optional(),
});

export async function POST(req: Request) {
  const refused = await fromThisServer(req);
  if (refused) return refused;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation", message: parsed.error.message }, { status: 400 });
  const { email, org: slug, groupIds, text } = parsed.data;

  const member = await db.membership.findFirst({
    where: { user: { email }, org: { slug } },
    include: { org: { select: { slug: true, name: true } } },
  });
  if (!member) return Response.json({ error: "forbidden", message: "not a member of this company" }, { status: 403 });

  const key =
    req.headers.get("idempotency-key")?.slice(0, 100) ||
    createHash("sha256").update(`${slug}\n${groupIds.join(",")}\n${text}\n${Date.now()}`).digest("hex").slice(0, 40);
  try {
    const groups = await sendToGroups(member.org, groupIds, text, `group:${key}`);
    return Response.json({ groups });
  } catch (err) {
    console.error("[notify/groups/send] failed:", err);
    return Response.json({ error: "hub_error", message: "could not reach the notification service" }, { status: 502 });
  }
}
