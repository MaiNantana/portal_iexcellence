"use server";

import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { realUser, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { createGroupLinkKey, createLinkKey, deactivateHubUser, HubError, hubGroupsEnabled, sendHubGroups, setHubPrimary, unlinkHubGroup, type HubChannel } from "@/lib/hub";
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
    groupsOff: "การส่งเข้ากลุ่มยังไม่เปิดให้ใช้งาน",
    groupTest: (name: string) => `ทดสอบการแจ้งเตือนเข้ากลุ่ม "${name}" จาก iExcellence Portal ✓`,
    groupSent: "ส่งเข้ากลุ่มแล้ว",
    groupLeft: "บอทไม่อยู่ในกลุ่มนี้แล้ว เชิญกลับแล้ว /link ใหม่",
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
    groupsOff: "Group notifications are not available yet.",
    groupTest: (name: string) => `Test notification to "${name}" from iExcellence Portal ✓`,
    groupSent: "Sent to the group",
    groupLeft: "The bot is no longer in this group. Invite it back and /link again.",
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

// ---- Group chats (admins only; off until HUB_GROUPS_ENABLED=1) ----

export type GroupKeyState = { error?: string; command?: string; key?: string; expiresAt?: string };

async function requireGroupAdmin(slug: string) {
  const member = await requireMember(slug);
  const t = TEXT[await getLocale()];
  if (member.role !== "ADMIN") return { member, t, error: t.adminOnly };
  if (!hubGroupsEnabled()) return { member, t, error: t.groupsOff };
  if (!(await notActing())) return { member, t, error: t.acting };
  return { member, t, error: undefined };
}

/** "Connect a group": a one-time `/link <key>` command for a LINE / Telegram group (15 minutes). */
export async function requestGroupLinkKey(slug: string): Promise<GroupKeyState> {
  const { member, t, error } = await requireGroupAdmin(slug);
  if (error) return { error };
  try {
    const k = await createGroupLinkKey(member.org, member.user);
    return { key: k.key, command: k.command, expiresAt: k.expiresAt };
  } catch (err) {
    console.error("[notify] group link key failed:", err);
    return { error: t.unreachable };
  }
}

export async function unlinkGroup(slug: string, groupId: string) {
  const { member, error } = await requireGroupAdmin(slug);
  if (error) return;
  try {
    await unlinkHubGroup(member.org.slug, groupId, true);
  } catch (err) {
    console.error("[notify] group unlink failed:", err);
  }
  revalidatePath("/", "layout");
}

export async function sendGroupTest(slug: string, groupId: string, name: string): Promise<{ ok?: string; error?: string }> {
  const { member, t, error } = await requireGroupAdmin(slug);
  if (error) return { error };
  try {
    const [r] = await sendHubGroups(member.org, [groupId], t.groupTest(name.slice(0, 80)), `portal:group-test:${randomUUID()}`, "portal-group-test");
    if (r?.status === "sent") return { ok: t.groupSent };
    if (r?.status === "left") return { error: t.groupLeft };
    return { error: t.failed };
  } catch (err) {
    console.error("[notify] group test failed:", err);
    return { error: t.failed };
  }
}
