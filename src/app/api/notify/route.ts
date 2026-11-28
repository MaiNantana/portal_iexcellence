import { randomUUID } from "node:crypto";
import { z } from "zod";
import { fromThisServer } from "@/lib/local-call";
import { notify } from "@/lib/notify";

/**
 * POST /api/notify: the one entry point HR and Task use to notify Portal members on LINE / Telegram / Discord
 * ("App อื่นส่งเรื่องเข้า Portal → Portal เรียก API #2" in the Notification Hub handoff).
 *
 *   Idempotency-Key: <one value per notification; reuse it on retry>
 *   { "to": ["a@acme.com"], "org": "acme", "text": "…", "ref": "task-123" }
 *
 * Optional LINE card from a Hub template (Hub doc, 2026-11-25). `text` is still required: Discord gets it,
 * and LINE / Telegram fall back to it if the Hub refuses the card.
 *   { …, "app": "task", "template": "task_assigned",
 *     "data": { "taskName": "…", "dueDate": "27 พ.ย. 2569", "title"?: "…", "action"?: { "url": "https://…", "label"?: "…" } } }
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
  app: z.string().trim().regex(/^[a-z0-9_-]{1,32}$/).optional(),
  template: z.string().trim().regex(/^[a-z0-9_-]{1,64}$/).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  const refused = await fromThisServer(req);
  if (refused) return refused;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation", message: parsed.error.message }, { status: 400 });
  const { to, org, text, ref, app, template, data } = parsed.data;
  if (Boolean(app) !== Boolean(template)) return Response.json({ error: "validation", message: "app and template go together" }, { status: 400 });
  if (data && JSON.stringify(data).length > 8000) return Response.json({ error: "validation", message: "data is too large" }, { status: 400 });
  const card = app && template ? { app, template, data: data ?? {} } : undefined;
  if (!to.length || to.length > 5000) return Response.json({ error: "validation", message: "to: 1–5000 emails" }, { status: 400 });

  const key = req.headers.get("idempotency-key")?.trim().slice(0, 120) || randomUUID();
  try {
    const results = await notify({ emails: to, org: org || undefined, text, card, ref, idempotencyKey: `app:${key}` });
    return Response.json({ results });
  } catch (err) {
    console.error("[notify] failed:", err);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
