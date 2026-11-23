// Client for the Notification Hub (LINE / Telegram). Server-side only: HUB_API_KEY must never reach the browser.
// API reference: NOTIFICATION-HUB × Portal handoff (2026-11-20). Production Hub runs on the same server at
// http://127.0.0.1:4100; /v1 is not reachable through the public notify.iexcellence.cloud host.

export type HubChannel = "line" | "telegram";
export const HUB_CHANNELS: HubChannel[] = ["line", "telegram"];
export type HubChannelStatus = "connected" | "blocked" | "not_linked";
export type HubRecipientStatus = "sent" | "not_linked" | "blocked" | "failed";

export type HubUserChannels = {
  userId: string;
  primary: HubChannel | null;
  channels: Partial<Record<string, { status: HubChannelStatus; linkedAt?: string }>>;
};

export type HubLinkKey = { key: string; liffUrl?: string; telegramUrl?: string; expiresAt: string };
export type HubRecipient = { user: string; status: HubRecipientStatus; channel?: HubChannel; error?: string };

export class HubError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function hubConfigured() {
  return Boolean(process.env.HUB_BASE_URL && process.env.HUB_API_KEY);
}

/** Hub `company` is a slug of A-Z a-z 0-9 _ - (1–64); Portal slugs already fit. */
function company(slug: string) {
  return slug.slice(0, 64);
}

async function hub<T>(method: string, path: string, body?: unknown, opts: { timeoutMs?: number; idempotencyKey?: string } = {}): Promise<{ status: number; data: T }> {
  const base = process.env.HUB_BASE_URL;
  const key = process.env.HUB_API_KEY;
  if (!base || !key) throw new HubError(0, "not_configured", "HUB_BASE_URL / HUB_API_KEY are not set");
  const res = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new HubError(res.status, data?.error ?? "http_error", data?.message ?? `Hub ${method} ${path} → ${res.status}`);
  return { status: res.status, data };
}

/** API #1: one-time key (15 min) to link LINE or Telegram. Each key links one channel. */
export async function createLinkKey(org: { slug: string; name: string }, user: { id: string; email: string }) {
  const { data } = await hub<HubLinkKey>("POST", "/v1/link-keys", {
    company: company(org.slug),
    companyName: org.name.slice(0, 100),
    userId: user.id,
    email: user.email,
  });
  return data;
}

/**
 * LINE opens links in its own in-app browser, which has none of the user's sign-ins (Task then shows
 * its login, and Google sign-in is blocked there). `openExternalBrowser=1` is LINE's switch to open
 * the link in the phone's normal browser instead; Telegram ignores it. Only our own hosts get it, so
 * outside links (signed file URLs etc.) are left exactly as they are.
 */
const OWN_HOST = /(^|\.)iexcellence\.(cloud|net)$/i;
export function openLinksInExternalBrowser(text: string) {
  return text.replace(/https?:\/\/[^\s<>"']+/g, (raw) => {
    const trail = raw.match(/[).,!?;:]+$/)?.[0] ?? ""; // sentence punctuation after the link
    const link = trail ? raw.slice(0, -trail.length) : raw;
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return raw;
    }
    if (!OWN_HOST.test(url.hostname) || url.searchParams.has("openExternalBrowser")) return raw;
    url.searchParams.set("openExternalBrowser", "1");
    return url.toString() + trail;
  });
}

/**
 * API #2: send a text to Portal users (1–1000 per call; larger lists are split here).
 * The Hub picks each person's channel. Retries must reuse the same idempotencyKey.
 */
export async function sendHubEvent(org: { slug: string; name: string }, userIds: string[], text: string, idempotencyKey: string, ref?: string) {
  const recipients: HubRecipient[] = [];
  for (let i = 0; i < userIds.length; i += 1000) {
    const chunk = userIds.slice(i, i + 1000);
    const { data } = await hub<{ messageId: string; recipients: HubRecipient[] }>(
      "POST",
      "/v1/events",
      {
        company: company(org.slug),
        companyName: org.name.slice(0, 100),
        event: "common.announcement",
        to: { users: chunk },
        data: { text: openLinksInExternalBrowser(text).slice(0, 4900) },
        ...(ref ? { ref: ref.slice(0, 128) } : {}),
      },
      // Telegram sends ~25 messages/second, so a large list can take a while.
      { timeoutMs: 90_000, idempotencyKey: userIds.length > 1000 ? `${idempotencyKey}#${i / 1000}` : idempotencyKey },
    );
    recipients.push(...(data.recipients ?? []));
  }
  return recipients;
}

/** API #3: unlink one channel, or every channel when `channel` is omitted (member removed). */
export async function deactivateHubUser(orgSlug: string, userId: string, channel?: HubChannel) {
  const { data } = await hub<{ unlinked: boolean }>("POST", `/v1/users/${encodeURIComponent(userId)}/deactivate`, {
    company: company(orgSlug),
    ...(channel ? { channel } : {}),
  });
  return data.unlinked;
}

/** API #4: channel status of every linked member of a company (absent = not linked). */
export async function hubLinks(orgSlug: string) {
  const { data } = await hub<{ users: HubUserChannels[] }>("GET", `/v1/links?company=${encodeURIComponent(company(orgSlug))}`);
  return new Map((data.users ?? []).map((u) => [u.userId, u]));
}

/** API #5: one member's channels (every enabled channel is listed, unlinked ones as not_linked). */
export async function hubUserChannels(orgSlug: string, userId: string) {
  const { data } = await hub<HubUserChannels>("GET", `/v1/users/${encodeURIComponent(userId)}/channels?company=${encodeURIComponent(company(orgSlug))}`);
  return data;
}

/** API #6: choose which linked channel receives notifications. */
export async function setHubPrimary(orgSlug: string, userId: string, channel: HubChannel) {
  await hub("PUT", `/v1/users/${encodeURIComponent(userId)}/primary`, { company: company(orgSlug), channel });
}
