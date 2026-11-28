"use server";

import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { realUser, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { addDiscordGroup, DiscordWebhookError, isDiscordGroupId, removeDiscordGroup, sendToGroups } from "@/lib/groups";
import { createGroupCode, createLinkKey, deactivateHubUser, HubError, hubGroupsEnabled, setHubPrimary, unlinkHubGroup, type HubChannel } from "@/lib/hub";
import { LineOaError, removeLineChannel, resyncLineChannel, saveLineChannel } from "@/lib/line-oa";
import { notify } from "@/lib/notify";
import { defineText } from "@/i18n";
import { getLocale } from "@/i18n/server";

export type LinkKeyState = { error?: string; url?: string; qr?: string; key?: string; expiresAt?: string };

const TEXT = defineText({
  th: {
    badChannel: "ช่องทางไม่ถูกต้อง",
    acting: "ระหว่างสวมรอยเชื่อมช่องทางแจ้งเตือนแทนคนอื่นไม่ได้",
    off: (name: string) => `${name} ยังไม่เปิดให้ใช้งาน`,
    unreachable: "ติดต่อระบบแจ้งเตือนไม่ได้ ลองใหม่อีกครั้ง",
    test: "ทดสอบการแจ้งเตือนจาก iExcellence Portal ✓",
    sent: (via: string) => `ส่งแล้วทาง ${via}`,
    nothing: "ยังไม่มีช่องทางที่ส่งถึง เชื่อมช่องทางก่อน",
    failed: "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง",
    adminOnly: "เฉพาะ admin ของบริษัท",
    groupsOff: "การส่งเข้ากลุ่ม LINE ยังไม่เปิดให้ใช้งาน",
    groupTest: (name: string) => `ทดสอบการแจ้งเตือนเข้ากลุ่ม "${name}" จาก iExcellence Portal ✓`,
    groupSent: "ส่งเข้ากลุ่มแล้ว",
    groupLeft: "บอทไม่อยู่ในกลุ่มนี้แล้ว เชิญ Iex.Notification กลับเข้ากลุ่ม",
    discordLeft: "Webhook นี้ถูกลบใน Discord แล้ว ลบแล้วเพิ่มใหม่",
    webhook: {
      invalid: "ลิงก์ไม่ใช่ Webhook URL ของ Discord (https://discord.com/api/webhooks/…)",
      not_found: "ไม่พบ Webhook นี้ใน Discord (อาจถูกลบไปแล้ว)",
      duplicate: "Webhook นี้เพิ่มไว้แล้ว",
      unreachable: "ติดต่อ Discord ไม่ได้ ลองใหม่อีกครั้ง",
    },
    lineOa: {
      invalid: "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง: Channel ID เป็นตัวเลข, Channel secret 32 ตัวอักษร, Channel access token (long-lived)",
      bad_token: "LINE ไม่รับ Channel access token นี้ (หมดอายุหรือถูกออกใหม่แล้ว) ออก token ใหม่ใน LINE Developers",
      channel_mismatch: "Channel access token นี้ไม่ใช่ของ Channel ID ที่กรอก",
      unreachable: "ติดต่อ LINE ไม่ได้ ลองใหม่อีกครั้ง",
    },
  },
  en: {
    badChannel: "Unknown channel.",
    acting: "You can't connect notification channels while acting as someone else.",
    off: (name: string) => `${name} is not available yet.`,
    unreachable: "Can't reach the notification service. Please try again.",
    test: "Test notification from iExcellence Portal ✓",
    sent: (via: string) => `Sent via ${via}`,
    nothing: "No channel can receive it yet. Connect a channel first.",
    failed: "Sending failed. Please try again.",
    adminOnly: "Company admins only.",
    groupsOff: "LINE groups are not available yet.",
    groupTest: (name: string) => `Test notification to "${name}" from iExcellence Portal ✓`,
    groupSent: "Sent to the group",
    groupLeft: "The bot is no longer in this group. Invite Iex.Notification back into it.",
    discordLeft: "This webhook was deleted in Discord. Remove it and add a new one.",
    webhook: {
      invalid: "That isn't a Discord webhook URL (https://discord.com/api/webhooks/…)",
      not_found: "Discord doesn't know this webhook (it may have been deleted).",
      duplicate: "This webhook is already added.",
      unreachable: "Can't reach Discord. Please try again.",
    },
    lineOa: {
      invalid: "Missing or malformed: Channel ID is numeric, Channel secret is 32 characters, plus a long-lived Channel access token.",
      bad_token: "LINE rejected this Channel access token (expired or reissued). Issue a new one in LINE Developers.",
      channel_mismatch: "This Channel access token belongs to a different Channel ID.",
      unreachable: "Can't reach LINE. Please try again.",
    },
  },
});

function isChannel(v: string): v is HubChannel {
  return v === "line" || v === "telegram";
}

async function notActing() {
  return !(await realUser())?.acting;
}

/** "Connect LINE" / "Connect Telegram": a new one-time key (the previous one stops working). */
export async function requestLinkKey(slug: string, channel: string): Promise<LinkKeyState> {
  const member = await requireMember(slug);
  const t = TEXT[await getLocale()];
  if (!isChannel(channel)) return { error: t.badChannel };
  if (!(await notActing())) return { error: t.acting };
  try {
    const k = await createLinkKey(member.org, member.user);
    const url = channel === "line" ? k.liffUrl : k.telegramUrl;
    if (!url) return { error: t.off(channel === "telegram" ? "Telegram" : "LINE") };
    return { url, key: k.key, expiresAt: k.expiresAt, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }) };
  } catch (err) {
    console.error("[notify] link key failed:", err);
    return { error: t.unreachable };
  }
}

export async function choosePrimary(slug: string, channel: string) {
  const member = await requireMember(slug);
  if (!isChannel(channel)) return;
  try {
    await setHubPrimary(member.org.slug, member.userId, channel);
  } catch (err) {
    if (!(err instanceof HubError && err.code === "not_linked")) console.error("[notify] set primary failed:", err);
  }
  revalidatePath("/", "layout");
}

export async function unlinkChannel(slug: string, channel: string) {
  const member = await requireMember(slug);
  try {
    if (channel === "discord") await db.discordLink.deleteMany({ where: { userId: member.userId } });
    else if (isChannel(channel)) await deactivateHubUser(member.org.slug, member.userId, channel);
  } catch (err) {
    console.error("[notify] unlink failed:", err);
  }
  revalidatePath("/", "layout");
}

/** Sends the member a test message on every linked channel. */
export async function sendTestNotification(slug: string): Promise<{ ok?: string; error?: string }> {
  const member = await requireMember(slug);
  const t = TEXT[await getLocale()];
  try {
    const [r] = await notify({
      emails: [member.user.email],
      org: member.org.slug,
      text: t.test,
      idempotencyKey: `portal:test:${randomUUID()}`,
    });
    const sent = [r?.hub?.status === "sent" ? (("channel" in r.hub && r.hub.channel) || "LINE/Telegram") : null, r?.discord?.status === "sent" ? "discord" : null].filter(Boolean);
    return sent.length ? { ok: t.sent(sent.join(", ")) } : { error: t.nothing };
  } catch (err) {
    console.error("[notify] test failed:", err);
    return { error: t.failed };
  }
}

// ---- Notification groups (company admins): LINE groups via the Hub, Discord channels via webhooks ----

export type GroupKeyState = { error?: string; command?: string; key?: string; expiresAt?: string };

async function requireGroupAdmin(slug: string) {
  const member = await requireMember(slug);
  const t = TEXT[await getLocale()];
  if (member.role !== "ADMIN") return { member, t, error: t.adminOnly };
  if (!(await notActing())) return { member, t, error: t.acting };
  return { member, t, error: undefined };
}

/** "Connect a LINE group": a one-time `/register <code>` (24 hours) to type in the group. */
export async function requestGroupLinkKey(slug: string): Promise<GroupKeyState> {
  const { member, t, error } = await requireGroupAdmin(slug);
  if (error) return { error };
  if (!hubGroupsEnabled()) return { error: t.groupsOff };
  try {
    const k = await createGroupCode(member.org);
    return { key: k.code, command: k.command, expiresAt: k.expiresAt };
  } catch (err) {
    console.error("[notify] group code failed:", err);
    return { error: t.unreachable };
  }
}

/** "Add a Discord channel": a channel webhook URL pasted by the admin. */
export async function addDiscordGroupAction(slug: string, _prev: { error?: string; ok?: boolean } | null, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const { member, t, error } = await requireGroupAdmin(slug);
  if (error) return { error };
  try {
    await addDiscordGroup(member.org.id, String(form.get("url") ?? ""), String(form.get("name") ?? ""), member.user.email);
  } catch (err) {
    if (err instanceof DiscordWebhookError) return { error: t.webhook[err.code] };
    console.error("[notify] add Discord group failed:", err);
    return { error: t.failed };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function unlinkGroup(slug: string, groupId: string) {
  const { member, error } = await requireGroupAdmin(slug);
  if (error) return;
  try {
    if (isDiscordGroupId(groupId)) await removeDiscordGroup(member.org.id, groupId);
    else if (hubGroupsEnabled()) await unlinkHubGroup(member.org.slug, groupId);
  } catch (err) {
    console.error("[notify] group unlink failed:", err);
  }
  revalidatePath("/", "layout");
}

export async function sendGroupTest(slug: string, groupId: string, name: string): Promise<{ ok?: string; error?: string }> {
  const { member, t, error } = await requireGroupAdmin(slug);
  if (error) return { error };
  try {
    const [r] = await sendToGroups(member.org, [groupId], t.groupTest(name.slice(0, 80)), `portal:group-test:${randomUUID()}`);
    if (r?.status === "sent") return { ok: t.groupSent };
    if (r?.status === "left") return { error: isDiscordGroupId(groupId) ? t.discordLeft : t.groupLeft };
    return { error: t.failed };
  } catch (err) {
    console.error("[notify] group test failed:", err);
    return { error: t.failed };
  }
}

/** "Use our own LINE OA for groups": verified with LINE, stored encrypted, then handed to the Hub. */
export async function saveLineChannelAction(slug: string, _prev: { error?: string; ok?: boolean } | null, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const { member, t, error } = await requireGroupAdmin(slug);
  if (error) return { error };
  try {
    await saveLineChannel(
      member.org,
      { channelId: String(form.get("channelId") ?? ""), channelSecret: String(form.get("channelSecret") ?? ""), accessToken: String(form.get("accessToken") ?? "") },
      member.user.email,
    );
  } catch (err) {
    if (err instanceof LineOaError) return { error: t.lineOa[err.code] };
    console.error("[notify] save LINE OA failed:", err);
    return { error: t.failed };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resyncLineChannelAction(slug: string) {
  const { member, error } = await requireGroupAdmin(slug);
  if (error) return;
  await resyncLineChannel(member.org).catch((err) => console.error("[notify] LINE OA resync failed:", err));
  revalidatePath("/", "layout");
}

export async function removeLineChannelAction(slug: string) {
  const { member, error } = await requireGroupAdmin(slug);
  if (error) return;
  await removeLineChannel(member.org).catch((err) => console.error("[notify] remove LINE OA failed:", err));
  revalidatePath("/", "layout");
}
