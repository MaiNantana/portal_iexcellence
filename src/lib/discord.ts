// Discord notifications: the Portal's own bot sends each linked member a DM.
// A bot can only DM people who share a server with it, so linking (OAuth with `identify guilds.join`)
// also adds the member to the company Discord server DISCORD_GUILD_ID, where the bot is a member.
//
// Settings (.env): DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID.
// Redirect URI to register in the Discord developer portal: {AUTH_URL}/api/discord/callback

import { db } from "@/lib/db";
import { portalIssuer } from "@/lib/handoff";

const API = "https://discord.com/api/v10";

export function discordConfigured() {
  const e = process.env;
  return Boolean(e.DISCORD_CLIENT_ID && e.DISCORD_CLIENT_SECRET && e.DISCORD_BOT_TOKEN && e.DISCORD_GUILD_ID);
}

export function discordRedirectUri() {
  return `${portalIssuer().replace(/\/+$/, "")}/api/discord/callback`;
}

export function discordAuthorizeUrl(state: string) {
  const q = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: discordRedirectUri(),
    scope: "identify guilds.join",
    state,
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

async function discord<T>(path: string, init: RequestInit & { auth?: string } = {}): Promise<T> {
  const { auth, ...rest } = init;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: { Authorization: auth ?? `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json", ...rest.headers },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Discord ${rest.method ?? "GET"} ${path} → ${res.status} ${await res.text().catch(() => "")}`.slice(0, 500));
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** OAuth callback: code → Discord user; joins them to the company server so the bot can DM them. */
export async function linkDiscordAccount(userId: string, code: string) {
  const tokenRes = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: discordRedirectUri(),
      client_id: process.env.DISCORD_CLIENT_ID ?? "",
      client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenRes.ok) throw new Error(`Discord token exchange → ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const me = await discord<{ id: string; username: string; global_name?: string | null }>("/users/@me", { auth: `Bearer ${access_token}` });
  // 201 = added, 204 = already a member.
  await discord(`/guilds/${process.env.DISCORD_GUILD_ID}/members/${me.id}`, { method: "PUT", body: JSON.stringify({ access_token }) });

  const username = me.global_name || me.username;
  await db.discordLink.upsert({
    where: { userId },
    create: { userId, discordUserId: me.id, username },
    update: { discordUserId: me.id, username, dmChannelId: null, linkedAt: new Date() },
  });
  await sendDiscordDm(userId, me.id, null, "เชื่อม Discord กับ iExcellence Portal แล้ว ✓ ต่อไปจะได้รับแจ้งเตือนทางนี้");
  return username;
}

/** Sends one DM (split at Discord's 2000-character limit). */
export async function sendDiscordDm(userId: string, discordUserId: string, dmChannelId: string | null, text: string) {
  let channel = dmChannelId;
  if (!channel) {
    ({ id: channel } = await discord<{ id: string }>("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: discordUserId }) }));
    await db.discordLink.updateMany({ where: { userId }, data: { dmChannelId: channel } });
  }
  for (let i = 0; i < text.length; i += 2000) {
    await discord(`/channels/${channel}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: text.slice(i, i + 2000), allowed_mentions: { parse: [] } }),
    });
  }
}
