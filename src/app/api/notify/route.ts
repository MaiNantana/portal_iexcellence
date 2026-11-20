import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { notify } from "@/lib/notify";

/**
 * POST /api/notify: the one entry point HR and Task use to notify Portal members on LINE / Telegram / Discord.
 *
 *   Authorization: Bearer <key from PORTAL_NOTIFY_KEYS>   (PORTAL_NOTIFY_KEYS="task:<key>,hr:<key>")
 *   Idempotency-Key: <one value per notification; reuse it on retry>
 *   { "to": ["a@acme.com"], "org": "acme", "text": "…", "ref": "task-123" }
 *
 * `org` is optional (Task workspaces don't know the Portal company): without it each person gets the
 * notification once, under the company they used last. Recipients without a Portal account are skipped.
 */

const Body = z.object({
  to: z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v])),
  org: z.string().trim().max(64).optional(),
  text: z.string().trim().min(1).max(4900),
  ref: z.string().max(128).optional(),
});

function caller(header: string | null) {
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;
  for (const entry of (process.env.PORTAL_NOTIFY_KEYS ?? "").split(",")) {
    const i = entry.indexOf(":");
    const [name, key] = [entry.slice(0, i).trim(), entry.slice(i + 1).trim()];
    if (!name || key.length < 24) continue;
    const a = Buffer.from(key);
    const b = Buffer.from(token);
    if (a.length === b.length && timingSafeEqual(a, b)) return name;
  }
  return null;
}

export async function POST(req: Request) {
  const source = caller(req.headers.get("authorization"));
  if (!source) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation", message: parsed.error.message }, { status: 400 });
  const { to, org, text, ref } = parsed.data;
  if (!to.length || to.length > 5000) return Response.json({ error: "validation", message: "to: 1–5000 emails" }, { status: 400 });

  const key = req.headers.get("idempotency-key")?.trim().slice(0, 120) || randomUUID();
  try {
    const results = await notify({ emails: to, org: org || undefined, text, ref, idempotencyKey: `${source}:${key}` });
    return Response.json({ results });
  } catch (err) {
    console.error(`[notify] from ${source} failed:`, err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
