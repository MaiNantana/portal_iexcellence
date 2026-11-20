import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { networkInterfaces } from "node:os";
import { z } from "zod";
import { portalIssuer } from "@/lib/handoff";
import { notify } from "@/lib/notify";

/**
 * POST /api/notify: the one entry point HR and Task use to notify Portal members on LINE / Telegram / Discord
 * ("App อื่นส่งเรื่องเข้า Portal → Portal เรียก API #2" in the Notification Hub handoff).
 *
 *   Idempotency-Key: <one value per notification; reuse it on retry>
 *   { "to": ["a@acme.com"], "org": "acme", "text": "…", "ref": "task-123" }
 *
 * Like the Hub's own /v1, it only accepts calls from this server: Portal, HR, Task and the Hub all run on
 * the same machine, so no key is needed. `org` is optional (Task workspaces don't know the Portal company):
 * without it each person gets the notification once, under the company they used last.
 */

const Body = z.object({
  to: z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v])),
  org: z.string().trim().max(64).optional(),
  text: z.string().trim().min(1).max(4900),
  ref: z.string().max(128).optional(),
});

const norm = (ip: string) => ip.trim().replace(/^::ffff:/, "").toLowerCase();

/** This machine's addresses: loopback, its network interfaces, and the public IP its own host name points at. */
let ownIps: { at: number; ips: Set<string> } | null = null;
async function serverIps() {
  if (ownIps && Date.now() - ownIps.at < 10 * 60_000) return ownIps.ips;
  const ips = new Set(["127.0.0.1", "::1"]);
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) ips.add(norm(a.address));
  try {
    for (const a of await lookup(new URL(portalIssuer()).hostname, { all: true })) ips.add(norm(a.address));
  } catch {
    // DNS down: loopback and interfaces still work.
  }
  ownIps = { at: Date.now(), ips };
  return ips;
}

/**
 * The caller's address. Under IIS, iisnode (enableXFF) appends the real client address as the last
 * X-Forwarded-For entry, so earlier entries a client sends itself are ignored.
 */
function callerIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  return xff ? norm(xff.split(",").at(-1) ?? "") : "127.0.0.1"; // next dev: no proxy, local machine
}

export async function POST(req: Request) {
  const ip = callerIp(req);
  if (!(await serverIps()).has(ip)) {
    console.warn(`[notify] refused call from ${ip}`);
    return Response.json({ error: "forbidden", message: "only callable from the Portal server" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation", message: parsed.error.message }, { status: 400 });
  const { to, org, text, ref } = parsed.data;
  if (!to.length || to.length > 5000) return Response.json({ error: "validation", message: "to: 1–5000 emails" }, { status: 400 });

  const key = req.headers.get("idempotency-key")?.trim().slice(0, 120) || randomUUID();
  try {
    const results = await notify({ emails: to, org: org || undefined, text, ref, idempotencyKey: `app:${key}` });
    return Response.json({ results });
  } catch (err) {
    console.error("[notify] failed:", err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
