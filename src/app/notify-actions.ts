"use server";

import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { realUser, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { createLinkKey, deactivateHubUser, HubError, setHubPrimary, type HubChannel } from "@/lib/hub";
import { notify } from "@/lib/notify";

export type LinkKeyState = { error?: string; url?: string; qr?: string; key?: string; expiresAt?: string };

function isChannel(v: string): v is HubChannel {
  return v === "line" || v === "telegram";
}

async function notActing() {
  return !(await realUser())?.acting;
}

/** "Connect LINE" / "Connect Telegram": a new one-time key (the previous one stops working). */
export async function requestLinkKey(slug: string, channel: string): Promise<LinkKeyState> {
  const member = await requireMember(slug);
  if (!isChannel(channel)) return { error: "ช่องทางไม่ถูกต้อง" };
  if (!(await notActing())) return { error: "ระหว่างสวมรอยเชื่อมช่องทางแจ้งเตือนแทนคนอื่นไม่ได้" };
  try {
    const k = await createLinkKey(member.org, member.user);
    const url = channel === "line" ? k.liffUrl : k.telegramUrl;
    if (!url) return { error: channel === "telegram" ? "Telegram ยังไม่เปิดให้ใช้งาน" : "LINE ยังไม่เปิดให้ใช้งาน" };
    return { url, key: k.key, expiresAt: k.expiresAt, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }) };
  } catch (err) {
    console.error("[notify] link key failed:", err);
    return { error: "ติดต่อระบบแจ้งเตือนไม่ได้ ลองใหม่อีกครั้ง" };
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
  try {
    const [r] = await notify({
      emails: [member.user.email],
      org: member.org.slug,
      text: "ทดสอบการแจ้งเตือนจาก iExcellence Portal ✓",
      idempotencyKey: `portal:test:${randomUUID()}`,
    });
    const sent = [r?.hub?.status === "sent" ? (("channel" in r.hub && r.hub.channel) || "LINE/Telegram") : null, r?.discord?.status === "sent" ? "discord" : null].filter(Boolean);
    return sent.length ? { ok: `ส่งแล้วทาง ${sent.join(", ")}` } : { error: "ยังไม่มีช่องทางที่ส่งถึง เชื่อมช่องทางก่อน" };
  } catch (err) {
    console.error("[notify] test failed:", err);
    return { error: "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}
