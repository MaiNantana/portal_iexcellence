import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { discordConfigured, sendDiscordDm } from "@/lib/discord";
import { hubConfigured, sendHubEvent, type HubCard, type HubRecipient } from "@/lib/hub";

// One notification fanned out to every channel the person has linked:
// LINE / Telegram through the Notification Hub (the Hub picks the primary one), Discord through the Portal's bot.
// HR and Task call this through POST /api/notify; they keep sending their own emails.

export type NotifyInput = {
  /** Recipient emails (Portal identity is the verified email shared with HR / Task). */
  emails: string[];
  /** Company slug. Without it each person gets it once, under the company they used last. */
  org?: string;
  text: string;
  /** Optional LINE card (Hub template). `text` stays the plain version for Discord and as a fallback. */
  card?: HubCard;
  /** Same key on a retry = no duplicate messages. */
  idempotencyKey: string;
  ref?: string;
};

export type NotifyResult = {
  email: string;
  /** not_member: no Portal account in that company, so nothing was sent. */
  status: "ok" | "not_member";
  hub?: Pick<HubRecipient, "status" | "channel" | "error"> | { status: "error" | "off" };
  discord?: { status: "sent" | "not_linked" | "duplicate" | "failed" | "off" };
};

export async function notify(input: NotifyInput): Promise<NotifyResult[]> {
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const users = await db.user.findMany({
    where: { email: { in: emails } },
    include: {
      discord: true,
      memberships: { include: { org: { select: { id: true, slug: true, name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });

  // Each person → the one company this notification is for.
  type Target = { user: (typeof users)[number]; org: { id: string; slug: string; name: string } };
  const targets = new Map<string, Target>();
  for (const user of users) {
    const ms = input.org ? user.memberships.filter((m) => m.org.slug === input.org) : user.memberships;
    const m = ms.find((x) => x.orgId === user.lastOrgId) ?? ms[0];
    if (m) targets.set(user.email, { user, org: m.org });
  }

  const results = new Map<string, NotifyResult>(emails.map((email) => [email, { email, status: "not_member" }]));
  for (const [email] of targets) results.set(email, { email, status: "ok" });

  // LINE / Telegram: one Hub call per company.
  const byOrg = new Map<string, Target[]>();
  for (const t of targets.values()) byOrg.set(t.org.id, [...(byOrg.get(t.org.id) ?? []), t]);
  for (const group of byOrg.values()) {
    const org = group[0].org;
    if (!hubConfigured()) {
      for (const t of group) results.get(t.user.email)!.hub = { status: "off" };
      continue;
    }
    try {
      const sent = await sendHubEvent(org, group.map((t) => t.user.id), input.text, `${input.idempotencyKey}:${org.slug}`, input.ref, input.card);
      const byUser = new Map(sent.map((r) => [r.user, r]));
      for (const t of group) {
        const r = byUser.get(t.user.id);
        results.get(t.user.email)!.hub = r ? { status: r.status, channel: r.channel, error: r.error } : { status: "error" };
      }
    } catch (err) {
      console.error(`[notify] Hub send for ${org.slug} failed:`, err);
      for (const t of group) results.get(t.user.email)!.hub = { status: "error" };
    }
  }

  // Discord: a DM per linked person, at most once per idempotency key.
  for (const t of targets.values()) {
    const r = results.get(t.user.email)!;
    const link = t.user.discord;
    if (!discordConfigured()) r.discord = { status: "off" };
    else if (!link) r.discord = { status: "not_linked" };
    else {
      try {
        await db.notifyDelivery.create({ data: { key: input.idempotencyKey.slice(0, 191), userId: t.user.id } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          r.discord = { status: "duplicate" };
          continue;
        }
        throw err;
      }
      try {
        await sendDiscordDm(t.user.id, link.discordUserId, link.dmChannelId, `[${t.org.name}] ${input.text}`);
        r.discord = { status: "sent" };
      } catch (err) {
        console.error(`[notify] Discord DM to ${t.user.email} failed:`, err);
        r.discord = { status: "failed" };
      }
    }
  }

  // Delivery keys only guard retries; keep a month.
  db.notifyDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } }).catch(() => {});
  return [...results.values()];
}
