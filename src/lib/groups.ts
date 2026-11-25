// Notification groups of a company: LINE groups (the Notification Hub's Admin API, on when
// HUB_ADMIN_URL / HUB_ADMIN_KEY are set) and Discord channels (our own, through a channel webhook, always on).
// A company can connect any number of each. Discord group ids are `dsc_<id>`; LINE ones are LINE's `C…` ids.
// Telegram groups are not in the Hub yet.

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hubGroups, hubGroupsEnabled, pushHubGroup } from "@/lib/hub";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

export type GroupChannel = "line" | "telegram" | "discord";
export type NotifyGroup = {
  groupId: string;
  channel: GroupChannel;
  name: string;
  status: "connected" | "left";
};
export type GroupSendResult = { group: string; status: "sent" | "left" | "not_found" | "failed"; channel?: GroupChannel; error?: string };

const PREFIX = "dsc_";
export const isDiscordGroupId = (id: string) => id.startsWith(PREFIX);

// ---- Discord webhooks ----

const WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{5,25})\/([\w-]{20,200})\/?(?:\?.*)?$/;

export class DiscordWebhookError extends Error {
  constructor(public code: "invalid" | "not_found" | "duplicate" | "unreachable") {
    super(code);
  }
}

/** Checks a pasted webhook URL with Discord and stores it for the company. */
export async function addDiscordGroup(orgId: string, url: string, name: string, email: string) {
  const m = WEBHOOK.exec(url.trim());
  if (!m) throw new DiscordWebhookError("invalid");
  const clean = `https://discord.com/api/webhooks/${m[1]}/${m[2]}`;
  let res: Response;
  try {
    res = await fetch(clean, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new DiscordWebhookError("unreachable");
  }
  if (res.status === 401 || res.status === 404) throw new DiscordWebhookError("not_found");
  if (!res.ok) throw new DiscordWebhookError("unreachable");
  const hook = (await res.json()) as { id: string; name?: string | null; channel_id?: string | null };
  try {
    return await db.discordGroup.create({
      data: {
        orgId,
        name: (name.trim() || hook.name || "Discord").slice(0, 100),
        webhookEnc: encryptSecret(clean),
        webhookId: hook.id ?? m[1],
        channelId: hook.channel_id ?? null,
        createdByEmail: email,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new DiscordWebhookError("duplicate");
    throw err;
  }
}

async function postWebhook(url: string, content: string) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${url}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, username: "iExcellence", allowed_mentions: { parse: [] } }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return "sent" as const;
    if (res.status === 401 || res.status === 404) return "left" as const;
    if (res.status === 429 && attempt < 2) {
      const wait = Number(((await res.json().catch(() => ({}))) as { retry_after?: number }).retry_after ?? 1);
      await new Promise((r) => setTimeout(r, Math.min(10, Math.max(0.2, wait)) * 1000));
      continue;
    }
    throw new Error(`Discord webhook → ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
}

/** Records (key, group) so a retry with the same key doesn't post twice; false = already sent. */
async function claim(idempotencyKey: string, gid: string) {
  try {
    await db.notifyDelivery.create({ data: { key: idempotencyKey.slice(0, 191), userId: gid.slice(0, 191) } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
}
const unclaim = (idempotencyKey: string, gid: string) =>
  db.notifyDelivery.deleteMany({ where: { key: idempotencyKey.slice(0, 191), userId: gid.slice(0, 191) } }).catch(() => {});

async function sendDiscordGroups(orgSlug: string, ids: string[], text: string, idempotencyKey: string): Promise<GroupSendResult[]> {
  const rows = await db.discordGroup.findMany({ where: { id: { in: ids.map((g) => g.slice(PREFIX.length)) }, org: { slug: orgSlug } } });
  const byId = new Map(rows.map((r) => [PREFIX + r.id, r]));
  const out: GroupSendResult[] = [];
  for (const gid of ids) {
    const row = byId.get(gid);
    if (!row) {
      out.push({ group: gid, status: "not_found" });
      continue;
    }
    if (!(await claim(idempotencyKey, gid))) {
      out.push({ group: gid, status: "sent", channel: "discord" });
      continue;
    }
    try {
      const url = decryptSecret(row.webhookEnc);
      let status: "sent" | "left" = "sent";
      for (let i = 0; i < text.length && status === "sent"; i += 2000) status = await postWebhook(url, text.slice(i, i + 2000));
      const stored = status === "left" ? "left" : "connected";
      if (row.status !== stored) await db.discordGroup.update({ where: { id: row.id }, data: { status: stored } });
      if (status === "left") await unclaim(idempotencyKey, gid);
      out.push({ group: gid, status, channel: "discord" });
    } catch (err) {
      console.error(`[groups] Discord ${gid} failed:`, err);
      await unclaim(idempotencyKey, gid);
      out.push({ group: gid, status: "failed", channel: "discord", error: "send_failed" });
    }
  }
  return out;
}

async function sendLineGroups(orgSlug: string, ids: string[], text: string, idempotencyKey: string): Promise<GroupSendResult[]> {
  if (!hubGroupsEnabled()) return ids.map((g) => ({ group: g, status: "not_found" as const }));
  // The Hub's admin key can post to any company's group, so only this company's groups get through.
  const own = new Map((await hubGroups(orgSlug)).map((g) => [g.groupId, g]));
  const out: GroupSendResult[] = [];
  for (const gid of ids) {
    const g = own.get(gid);
    if (!g) {
      out.push({ group: gid, status: "not_found" });
      continue;
    }
    if (!(await claim(idempotencyKey, gid))) {
      out.push({ group: gid, status: "sent", channel: "line" });
      continue;
    }
    try {
      const status = await pushHubGroup(gid, text);
      if (status === "left") await unclaim(idempotencyKey, gid);
      out.push({ group: gid, status, channel: "line" });
    } catch (err) {
      console.error(`[groups] LINE ${gid} failed:`, err);
      await unclaim(idempotencyKey, gid);
      out.push({ group: gid, status: "failed", channel: "line", error: "send_failed" });
    }
  }
  return out;
}

// ---- Both kinds ----

/**
 * Every group of a company. `hubError` is set when the Hub couldn't be asked (Discord groups are still listed).
 */
export async function companyGroups(org: { id: string; slug: string }) {
  const discord = await db.discordGroup.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
  const groups: NotifyGroup[] = discord.map((d) => ({ groupId: PREFIX + d.id, channel: "discord", name: d.name, status: d.status === "left" ? "left" : "connected" }));
  let hubError = false;
  if (hubGroupsEnabled()) {
    try {
      for (const g of await hubGroups(org.slug)) groups.push({ groupId: g.groupId, channel: "line", name: g.name, status: g.status });
    } catch (err) {
      console.error(`[groups] Hub groups for ${org.slug} failed:`, err);
      hubError = true;
    }
  }
  return { groups, hubError };
}

/** One text into some of a company's groups (Discord directly, LINE through the Hub). */
export async function sendToGroups(org: { slug: string; name: string }, groupIds: string[], text: string, idempotencyKey: string) {
  const ids = [...new Set(groupIds)];
  const body = `[${org.name}] ${text}`;
  const discordIds = ids.filter(isDiscordGroupId);
  const lineIds = ids.filter((g) => !isDiscordGroupId(g));
  return [
    ...(discordIds.length ? await sendDiscordGroups(org.slug, discordIds, body, idempotencyKey) : []),
    ...(lineIds.length ? await sendLineGroups(org.slug, lineIds, body, idempotencyKey) : []),
  ];
}

/** Disconnect a Discord group (the webhook itself stays in Discord until someone deletes it there). */
export async function removeDiscordGroup(orgId: string, groupId: string) {
  await db.discordGroup.deleteMany({ where: { orgId, id: groupId.slice(PREFIX.length) } });
}
