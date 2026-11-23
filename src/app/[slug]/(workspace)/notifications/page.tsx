import Link from "next/link";
import { choosePrimary, unlinkChannel } from "@/app/notify-actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ConnectChannelButton, TestNotificationButton } from "@/components/NotifyConnect";
import { orgPath, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { discordConfigured } from "@/lib/discord";
import { HUB_CHANNELS, hubConfigured, hubUserChannels, type HubUserChannels } from "@/lib/hub";
import { defineText, withLocale } from "@/i18n";
import { getLocale } from "@/i18n/server";

const NAMES: Record<string, string> = { line: "LINE", telegram: "Telegram", discord: "Discord" };

const TEXT = defineText({
  th: {
    discord: {
      ok: { ok: true, text: "เชื่อม Discord แล้ว ✓ ดูข้อความยืนยันใน DM ของ Discord" },
      cancelled: { ok: false, text: "ยกเลิกการเชื่อม Discord" },
      error: { ok: false, text: "เชื่อม Discord ไม่สำเร็จ ลองใหม่อีกครั้ง" },
      off: { ok: false, text: "Discord ยังไม่เปิดให้ใช้งาน" },
      acting: { ok: false, text: "ระหว่างสวมรอยเชื่อม Discord แทนคนอื่นไม่ได้" },
    } as Record<string, { ok: boolean; text: string }>,
    back: "‹ กลับหน้าแรก",
    title: "ช่องทางรับแจ้งเตือน",
    guide: "คู่มือตั้งค่าทีละขั้นตอน ›",
    lead: (email: string) => `แจ้งเตือนจาก HR และ Task (เช่น งานรออนุมัติ งานใกล้ครบกำหนด) ยังส่งทางอีเมล ${email} เหมือนเดิม และส่งทางช่องทางที่เชื่อมไว้ด้านล่างด้วย`,
    notAvailable: "ยังไม่เปิดให้ใช้งาน",
    unreachable: "ติดต่อระบบแจ้งเตือนไม่ได้ ลองใหม่อีกครั้ง",
    primary: "★ ช่องทางหลัก",
    connected: "เชื่อมแล้ว",
    blocked: (name: string) => `เชื่อมแล้ว แต่บล็อกบัญชีแจ้งเตือนอยู่ · ปลดบล็อกใน ${name}`,
    notConnected: "ยังไม่เชื่อม",
    makePrimary: "ใช้เป็นช่องทางหลัก",
    unlinkConfirm: (name: string) => `ยกเลิกการรับแจ้งเตือนทาง ${name}?`,
    unlink: "ยกเลิก",
    primaryNote: "แจ้งเตือนส่งทางช่องทางหลักช่องทางเดียว ถ้าส่งไม่ถึง (บล็อก) จะลองอีกช่องทาง",
    discordLinked: (who: string) => `เชื่อมแล้ว · ${who} · รับเป็นข้อความส่วนตัว (DM)`,
    discordNotLinked: "ยังไม่เชื่อม · จะเข้าร่วมเซิร์ฟเวอร์ Discord ของ iExcellence เพื่อรับ DM",
    connectDiscord: "เชื่อม Discord",
  },
  en: {
    discord: {
      ok: { ok: true, text: "Discord connected ✓ Check the confirmation in your Discord DMs" },
      cancelled: { ok: false, text: "Discord connection cancelled" },
      error: { ok: false, text: "Couldn't connect Discord. Please try again." },
      off: { ok: false, text: "Discord is not available yet" },
      acting: { ok: false, text: "You can't connect Discord while acting as someone else" },
    },
    back: "‹ Back to home",
    title: "Notification channels",
    guide: "Step-by-step setup guide ›",
    lead: (email: string) => `HR and Task notifications (such as approvals and tasks coming due) still go to ${email}, and also to the channels you connect below.`,
    notAvailable: "Not available yet",
    unreachable: "Can't reach the notification service. Please try again.",
    primary: "★ main channel",
    connected: "Connected",
    blocked: (name: string) => `Connected, but the notification account is blocked · unblock it in ${name}`,
    notConnected: "Not connected",
    makePrimary: "Make main channel",
    unlinkConfirm: (name: string) => `Stop notifications on ${name}?`,
    unlink: "Disconnect",
    primaryNote: "Notifications go to the main channel only. If it can't be reached (blocked), the other channel is tried.",
    discordLinked: (who: string) => `Connected · ${who} · sent as direct messages (DM)`,
    discordNotLinked: "Not connected · you'll join the iExcellence Discord server to receive DMs",
    connectDiscord: "Connect Discord",
  },
});

/** The member's own notification channels: LINE / Telegram (via the Notification Hub) and Discord. */
export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ discord?: string }>;
}) {
  const { slug } = await params;
  const { discord: discordResult } = await searchParams;
  const member = await requireMember(slug);
  const locale = await getLocale();
  const t = TEXT[locale];

  let hub: HubUserChannels | null = null;
  let hubError = false;
  if (hubConfigured()) {
    try {
      hub = await hubUserChannels(member.org.slug, member.userId);
    } catch (err) {
      console.error("[notifications] Hub status failed:", err);
      hubError = true;
    }
  }
  const discord = await db.discordLink.findUnique({ where: { userId: member.userId } });
  const hubChannels = hub ? [...new Set([...HUB_CHANNELS, ...Object.keys(hub.channels ?? {})])] : [];
  const linked = hubChannels.filter((c) => hub?.channels?.[c]?.status && hub.channels[c]!.status !== "not_linked");
  const banner = discordResult ? t.discord[discordResult] : undefined;

  return (
    <article className="card panel article" style={{ maxWidth: 640 }}>
      <Link href={withLocale(locale, orgPath(slug))} className="inline-link">
        {t.back}
      </Link>
      <h1>{t.title}</h1>
      <p className="body">{t.lead(member.user.email)}</p>
      <p style={{ margin: "-8px 0 16px" }}>
        <Link href={withLocale(locale, orgPath(slug, "/notifications/guide"))} className="inline-link">
          {t.guide}
        </Link>
      </p>
      {banner && <div className={`notice ${banner.ok ? "ok" : "error"}`}>{banner.text}</div>}

      <h2 style={{ marginTop: 20 }}>LINE / Telegram</h2>
      {!hubConfigured() ? (
        <div className="notice">{t.notAvailable}</div>
      ) : hubError ? (
        <div className="notice error">{t.unreachable}</div>
      ) : (
        <>
          {hubChannels.map((c) => {
            const status = hub?.channels?.[c]?.status ?? "not_linked";
            const primary = hub?.primary === c;
            const name = NAMES[c] ?? c;
            return (
              <div key={c} className="workrow" style={{ flexWrap: "wrap" }}>
                <span className="wtitle">
                  <b>
                    {name} {primary && linked.length > 1 && t.primary}
                  </b>
                  <small>{status === "connected" ? t.connected : status === "blocked" ? t.blocked(name) : t.notConnected}</small>
                </span>
                {status === "not_linked" ? (
                  (c === "line" || c === "telegram") && <ConnectChannelButton slug={slug} channel={c} />
                ) : (
                  <>
                    {!primary && linked.length > 1 && (
                      <form action={choosePrimary.bind(null, slug, c)}>
                        <button className="btn tiny">{t.makePrimary}</button>
                      </form>
                    )}
                    <form action={unlinkChannel.bind(null, slug, c)}>
                      <ConfirmButton className="btn tiny" message={t.unlinkConfirm(name)}>
                        {t.unlink}
                      </ConfirmButton>
                    </form>
                  </>
                )}
              </div>
            );
          })}
          {linked.length > 1 && <p className="body">{t.primaryNote}</p>}
        </>
      )}

      <h2 style={{ marginTop: 20 }}>Discord</h2>
      {!discordConfigured() ? (
        <div className="notice">{t.notAvailable}</div>
      ) : (
        <div className="workrow">
          <span className="wtitle">
            <b>Discord</b>
            <small>{discord ? t.discordLinked(discord.username ?? discord.discordUserId) : t.discordNotLinked}</small>
          </span>
          {discord ? (
            <form action={unlinkChannel.bind(null, slug, "discord")}>
              <ConfirmButton className="btn tiny" message={t.unlinkConfirm("Discord")}>
                {t.unlink}
              </ConfirmButton>
            </form>
          ) : (
            <a className="btn tiny primary" href={`/api/discord/connect?org=${encodeURIComponent(slug)}`}>
              {t.connectDiscord}
            </a>
          )}
        </div>
      )}

      {(linked.length > 0 || discord) && (
        <div style={{ marginTop: 20 }}>
          <TestNotificationButton slug={slug} />
        </div>
      )}
    </article>
  );
}
