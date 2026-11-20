import Link from "next/link";
import { choosePrimary, unlinkChannel } from "@/app/notify-actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ConnectChannelButton, TestNotificationButton } from "@/components/NotifyConnect";
import { orgPath, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { discordConfigured } from "@/lib/discord";
import { HUB_CHANNELS, hubConfigured, hubUserChannels, type HubUserChannels } from "@/lib/hub";

const NAMES: Record<string, string> = { line: "LINE", telegram: "Telegram", discord: "Discord" };

const DISCORD_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "เชื่อม Discord แล้ว ✓ ดูข้อความยืนยันใน DM ของ Discord" },
  cancelled: { ok: false, text: "ยกเลิกการเชื่อม Discord" },
  error: { ok: false, text: "เชื่อม Discord ไม่สำเร็จ ลองใหม่อีกครั้ง" },
  off: { ok: false, text: "Discord ยังไม่เปิดให้ใช้งาน" },
  acting: { ok: false, text: "ระหว่างสวมรอยเชื่อม Discord แทนคนอื่นไม่ได้" },
};

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
  const banner = discordResult ? DISCORD_MESSAGES[discordResult] : undefined;

  return (
    <article className="card panel article" style={{ maxWidth: 640 }}>
      <Link href={orgPath(slug)} className="inline-link">
        ‹ กลับหน้าแรก
      </Link>
      <h1>ช่องทางรับแจ้งเตือน</h1>
      <p className="body">
        แจ้งเตือนจาก HR และ Task (เช่น งานรออนุมัติ งานใกล้ครบกำหนด) ยังส่งทางอีเมล {member.user.email} เหมือนเดิม
        และส่งทางช่องทางที่เชื่อมไว้ด้านล่างด้วย
      </p>
      {banner && <div className={`notice ${banner.ok ? "ok" : "error"}`}>{banner.text}</div>}

      <h2 style={{ marginTop: 20 }}>LINE / Telegram</h2>
      {!hubConfigured() ? (
        <div className="notice">ยังไม่เปิดให้ใช้งาน</div>
      ) : hubError ? (
        <div className="notice error">ติดต่อระบบแจ้งเตือนไม่ได้ ลองใหม่อีกครั้ง</div>
      ) : (
        <>
          {hubChannels.map((c) => {
            const status = hub?.channels?.[c]?.status ?? "not_linked";
            const primary = hub?.primary === c;
            return (
              <div key={c} className="workrow" style={{ flexWrap: "wrap" }}>
                <span className="wtitle">
                  <b>
                    {NAMES[c] ?? c} {primary && linked.length > 1 && "★ ช่องทางหลัก"}
                  </b>
                  <small>
                    {status === "connected" ? "เชื่อมแล้ว" : status === "blocked" ? `เชื่อมแล้ว แต่บล็อกบัญชีแจ้งเตือนอยู่ · ปลดบล็อกใน ${NAMES[c] ?? c}` : "ยังไม่เชื่อม"}
                  </small>
                </span>
                {status === "not_linked" ? (
                  (c === "line" || c === "telegram") && <ConnectChannelButton slug={slug} channel={c} />
                ) : (
                  <>
                    {!primary && linked.length > 1 && (
                      <form action={choosePrimary.bind(null, slug, c)}>
                        <button className="btn tiny">ใช้เป็นช่องทางหลัก</button>
                      </form>
                    )}
                    <form action={unlinkChannel.bind(null, slug, c)}>
                      <ConfirmButton className="btn tiny" message={`ยกเลิกการรับแจ้งเตือนทาง ${NAMES[c] ?? c}?`}>
                        ยกเลิก
                      </ConfirmButton>
                    </form>
                  </>
                )}
              </div>
            );
          })}
          {linked.length > 1 && <p className="body">แจ้งเตือนส่งทางช่องทางหลักช่องทางเดียว ถ้าส่งไม่ถึง (บล็อก) จะลองอีกช่องทาง</p>}
        </>
      )}

      <h2 style={{ marginTop: 20 }}>Discord</h2>
      {!discordConfigured() ? (
        <div className="notice">ยังไม่เปิดให้ใช้งาน</div>
      ) : (
        <div className="workrow">
          <span className="wtitle">
            <b>Discord</b>
            <small>{discord ? `เชื่อมแล้ว · ${discord.username ?? discord.discordUserId} · รับเป็นข้อความส่วนตัว (DM)` : "ยังไม่เชื่อม · จะเข้าร่วมเซิร์ฟเวอร์ Discord ของ iExcellence เพื่อรับ DM"}</small>
          </span>
          {discord ? (
            <form action={unlinkChannel.bind(null, slug, "discord")}>
              <ConfirmButton className="btn tiny" message="ยกเลิกการรับแจ้งเตือนทาง Discord?">
                ยกเลิก
              </ConfirmButton>
            </form>
          ) : (
            <a className="btn tiny primary" href={`/api/discord/connect?org=${encodeURIComponent(slug)}`}>
              เชื่อม Discord
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
