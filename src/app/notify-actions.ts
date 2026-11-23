"use server";

import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { realUser, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { createLinkKey, deactivateHubUser, HubError, setHubPrimary, type HubChannel } from "@/lib/hub";
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
