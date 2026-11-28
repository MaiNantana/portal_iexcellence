// A company's own LINE Official Account, used for LINE GROUPS. A group has no email to link with (people link
// by email with Iex.Notification), so the OA's channel access token is what connects the company's groups
// to the Hub. The credentials are kept here (AES-GCM, lib/secrets.ts) AND handed to the Hub: the Hub needs the
// secret to verify that OA's webhook, and Portal passes the token along with every group push.
// Hub side: docs/HUB-LINE-OA-REQUEST.md (not live yet; saving still works, the Hub hand-off is retried later).

import { db } from "@/lib/db";
import { deleteHubLineChannel, HubError, hubGroupsEnabled, putHubLineChannel, type HubLineCredentials } from "@/lib/hub";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

export class LineOaError extends Error {
  constructor(public code: "invalid" | "bad_token" | "channel_mismatch" | "unreachable") {
    super(code);
  }
}

const LINE_API = "https://api.line.me";

async function line(path: string, token: string, init: RequestInit = {}) {
  try {
    return await fetch(`${LINE_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new LineOaError("unreachable");
  }
}

/** Checks the token with LINE: it must work, and belong to the channel ID that was typed. */
async function verify(channelId: string, accessToken: string) {
  const info = await line("/v2/bot/info", accessToken);
  if (info.status === 401 || info.status === 403) throw new LineOaError("bad_token");
  if (!info.ok) throw new LineOaError("unreachable");
  const bot = (await info.json()) as { userId?: string; basicId?: string; displayName?: string };

  // Tells which channel issued the token. Older token kinds may not be accepted here; then only bot/info counts.
  try {
    const res = await fetch(`${LINE_API}/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const v = (await res.json()) as { client_id?: string };
      if (v.client_id && v.client_id !== channelId) throw new LineOaError("channel_mismatch");
    }
  } catch (err) {
    if (err instanceof LineOaError) throw err;
  }
  return bot;
}

/** Hands the stored OA to the Hub and, when the Hub names a webhook URL, points the OA's webhook at it. */
async function syncToHub(org: { id: string; slug: string; name: string }) {
  const row = await db.lineChannel.findUnique({ where: { orgId: org.id } });
  if (!row || !hubGroupsEnabled()) return row;
  const accessToken = decryptSecret(row.accessTokenEnc);
  try {
    const { webhookUrl } = await putHubLineChannel(org, { channelId: row.channelId, channelSecret: decryptSecret(row.channelSecretEnc), accessToken });
    let hubError: string | null = null;
    if (webhookUrl) {
      const res = await line("/v2/bot/channel/webhook/endpoint", accessToken, { method: "PUT", body: JSON.stringify({ endpoint: webhookUrl }) }).catch(() => null);
      if (!res?.ok) hubError = "webhook_not_set";
    }
    return await db.lineChannel.update({ where: { id: row.id }, data: { hubSyncedAt: new Date(), hubError, hubWebhookUrl: webhookUrl ?? null } });
  } catch (err) {
    console.error(`[line-oa] Hub hand-off for ${org.slug} failed:`, err);
    const code = err instanceof HubError ? (err.status === 404 ? "hub_not_ready" : err.code) : "hub_unreachable";
    return await db.lineChannel.update({ where: { id: row.id }, data: { hubSyncedAt: null, hubError: code.slice(0, 191) } });
  }
}

/** Saves (or replaces) the company's OA after LINE confirms the token, then hands it to the Hub. */
export async function saveLineChannel(
  org: { id: string; slug: string; name: string },
  input: { channelId: string; channelSecret: string; accessToken: string },
  email: string,
) {
  const channelId = input.channelId.trim();
  const channelSecret = input.channelSecret.trim();
  const accessToken = input.accessToken.trim();
  if (!/^\d{6,20}$/.test(channelId) || !/^[0-9a-f]{32}$/i.test(channelSecret) || accessToken.length < 40 || /\s/.test(accessToken)) {
    throw new LineOaError("invalid");
  }
  const bot = await verify(channelId, accessToken);
  const data = {
    channelId,
    channelSecretEnc: encryptSecret(channelSecret),
    accessTokenEnc: encryptSecret(accessToken),
    botName: bot.displayName?.slice(0, 191) ?? null,
    basicId: bot.basicId?.slice(0, 191) ?? null,
    botUserId: bot.userId?.slice(0, 191) ?? null,
    hubSyncedAt: null,
    hubError: null,
    hubWebhookUrl: null,
    createdByEmail: email,
  };
  await db.lineChannel.upsert({ where: { orgId: org.id }, create: { orgId: org.id, ...data }, update: data });
  return syncToHub(org);
}

/** "Send to the Hub again" after the Hub was not ready or unreachable. */
export const resyncLineChannel = syncToHub;

/** The company goes back to Iex.Notification for groups. */
export async function removeLineChannel(org: { id: string; slug: string }) {
  if (hubGroupsEnabled()) {
    try {
      await deleteHubLineChannel(org.slug);
    } catch (err) {
      if (!(err instanceof HubError && err.status === 404)) console.error(`[line-oa] Hub removal for ${org.slug} failed:`, err);
    }
  }
  await db.lineChannel.deleteMany({ where: { orgId: org.id } });
}

/** What the admin page shows (never the secret or the token). */
export async function lineChannelSummary(orgId: string) {
  const row = await db.lineChannel.findUnique({ where: { orgId } });
  if (!row) return null;
  const { channelId, botName, basicId, hubSyncedAt, hubError, hubWebhookUrl, updatedAt } = row;
  return { channelId, botName, basicId, hubSyncedAt, hubError, hubWebhookUrl, updatedAt };
}

/** The token to send with a company's group pushes; null = the company uses Iex.Notification. */
export async function lineCredentials(orgSlug: string): Promise<HubLineCredentials | null> {
  const row = await db.lineChannel.findFirst({ where: { org: { slug: orgSlug } } });
  if (!row) return null;
  try {
    return { channelId: row.channelId, accessToken: decryptSecret(row.accessTokenEnc) };
  } catch (err) {
    // AUTH_SECRET changed: the stored token can't be read, so the admin has to enter it again.
    console.error(`[line-oa] can't decrypt the LINE token of ${orgSlug}:`, err);
    return null;
  }
}
