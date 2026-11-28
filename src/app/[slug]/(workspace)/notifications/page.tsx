import Link from "next/link";
import { choosePrimary, removeLineChannelAction, resyncLineChannelAction, unlinkChannel, unlinkGroup } from "@/app/notify-actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AddDiscordGroupForm, ConnectChannelButton, ConnectGroupButton, GroupTestButton, LineOaForm, TestNotificationButton } from "@/components/NotifyConnect";
import { orgPath, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { discordConfigured } from "@/lib/discord";
import { companyGroups, type NotifyGroup } from "@/lib/groups";
import { lineChannelSummary } from "@/lib/line-oa";
import { HUB_CHANNELS, hubConfigured, hubGroupsEnabled, hubUserChannels, type HubUserChannels } from "@/lib/hub";
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
    groups: "กลุ่มแจ้งเตือน",
    groupsLead: "ให้แจ้งเตือนจาก Task ส่งเข้ากลุ่ม LINE และช่อง Discord ของทีม เชื่อมได้หลายกลุ่ม แล้วเลือกกลุ่มใน Automation ของ Task เห็นเฉพาะ admin ของบริษัท",
    lineSoon: "กลุ่ม LINE ยังไม่เปิดให้ใช้งาน",
    telegramSoon: "กลุ่ม Telegram: เร็ว ๆ นี้ (รอผู้ให้บริการระบบแจ้งเตือน)",
    groupsGuide: "ขั้นตอนเชื่อมกลุ่ม ›",
    noGroups: "ยังไม่มีกลุ่มที่เชื่อมไว้",
    groupLeft: "บอทออกจากกลุ่มแล้ว · เชิญ Iex.Notification กลับเข้ากลุ่ม",
    discordLeft: "Webhook ถูกลบใน Discord แล้ว · ลบแล้วเพิ่มใหม่",
    unlinkGroupConfirm: (name: string) => `เลิกส่งแจ้งเตือนเข้า "${name}"?`,
    quota: "LINE นับโควตาข้อความตามจำนวนสมาชิกในกลุ่ม ส่ง 1 ครั้งเข้ากลุ่ม 20 คน = 20 ข้อความ · Discord ไม่จำกัด",
    oa: "LINE OA ที่ใช้ส่งเข้ากลุ่ม",
    oaDefault: "Iex.Notification (ค่าเริ่มต้น) · ใช้ LINE OA ของบริษัทเองได้ ข้อความในกลุ่มจะมาจาก OA ของบริษัท และนับโควตาในแพ็กเกจของบริษัท",
    oaOwn: (name: string, id: string) => `${name} · Channel ID ${id}`,
    oaSynced: "ส่งให้ระบบแจ้งเตือน (Hub) แล้ว",
    oaNotSynced: (code: string) =>
      code === "hub_not_ready" ? "บันทึกแล้ว · ระบบแจ้งเตือน (Hub) ยังไม่รองรับ OA ของบริษัท จะใช้ได้เมื่อ Hub พร้อม" : `บันทึกแล้ว แต่ยังส่งให้ Hub ไม่สำเร็จ (${code})`,
    oaWebhook: "Webhook URL ของ OA (ตั้งให้อัตโนมัติแล้ว)",
    oaWebhookFail: "ตั้ง Webhook URL ให้ OA อัตโนมัติไม่สำเร็จ · ใส่ URL นี้เองใน LINE Developers › Messaging API › Webhook URL",
    oaResync: "ส่งให้ Hub อีกครั้ง",
    oaRemove: "เลิกใช้ OA นี้",
    oaRemoveConfirm: "กลับไปใช้ Iex.Notification? กลุ่มที่เชื่อมผ่าน OA ของบริษัทจะไม่ได้รับแจ้งเตือนจนกว่าจะเชื่อมใหม่",
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
    groups: "Notification groups",
    groupsLead: "Send Task notifications into your team's LINE groups and Discord channels. Connect as many as you need, then pick one in a Task Automation. Only company admins see this.",
    lineSoon: "LINE groups are not available yet",
    telegramSoon: "Telegram groups: coming soon (waiting for the notification provider)",
    groupsGuide: "How to connect a group ›",
    noGroups: "No groups connected yet",
    groupLeft: "The bot left the group · invite Iex.Notification back",
    discordLeft: "The webhook was deleted in Discord · remove it and add a new one",
    unlinkGroupConfirm: (name: string) => `Stop notifications to "${name}"?`,
    quota: "LINE counts messages per group member: one message to a 20-person group = 20 messages. Discord has no quota.",
    oa: "LINE OA for groups",
    oaDefault: "Iex.Notification (default) · You can use your company's own LINE OA: group messages then come from your OA and count against your own LINE plan.",
    oaOwn: (name: string, id: string) => `${name} · Channel ID ${id}`,
    oaSynced: "Handed to the notification service (Hub)",
    oaNotSynced: (code: string) =>
      code === "hub_not_ready" ? "Saved · the notification service (Hub) doesn't support company OAs yet; it will work once the Hub does" : `Saved, but not handed to the Hub yet (${code})`,
    oaWebhook: "The OA's webhook URL (set for you)",
    oaWebhookFail: "Couldn't set the OA's webhook URL automatically · enter this URL in LINE Developers › Messaging API › Webhook URL",
    oaResync: "Send to the Hub again",
    oaRemove: "Stop using this OA",
    oaRemoveConfirm: "Go back to Iex.Notification? Groups connected through your OA stop receiving notifications until connected again.",
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

  // Company admins: the company's LINE groups (Hub) and Discord channels (webhooks), any number of each.
  const isAdmin = member.role === "ADMIN";
  const lineOn = hubGroupsEnabled();
  let groups: NotifyGroup[] = [];
  let groupsError = false;
  if (isAdmin) ({ groups, hubError: groupsError } = await companyGroups(member.org));
  const oa = isAdmin ? await lineChannelSummary(member.org.id) : null;

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

      {isAdmin && (
        <>
          <h2 style={{ marginTop: 28 }}>{t.groups}</h2>
          <p className="body" style={{ marginBottom: 12 }}>
            {t.groupsLead}{" "}
            <Link href={withLocale(locale, orgPath(slug, "/notifications/guide#groups"))} className="inline-link">
              {t.groupsGuide}
            </Link>
          </p>
          <div className="workrow" style={{ flexWrap: "wrap" }}>
            <span className="wtitle">
              <b>{t.oa}</b>
              <small>{oa ? t.oaOwn(oa.botName ?? oa.basicId ?? "LINE OA", oa.channelId) : t.oaDefault}</small>
              {oa && <small>{oa.hubSyncedAt ? t.oaSynced : t.oaNotSynced(oa.hubError ?? "hub_off")}</small>}
            </span>
            {oa && !oa.hubSyncedAt && lineOn && (
              <form action={resyncLineChannelAction.bind(null, slug)}>
                <button className="btn tiny">{t.oaResync}</button>
              </form>
            )}
            {oa && (
              <form action={removeLineChannelAction.bind(null, slug)}>
                <ConfirmButton className="btn tiny" message={t.oaRemoveConfirm}>
                  {t.oaRemove}
                </ConfirmButton>
              </form>
            )}
            <LineOaForm slug={slug} replacing={Boolean(oa)} />
          </div>
          {oa?.hubWebhookUrl && (
            <p className="body" style={{ fontSize: 13 }}>
              {oa.hubError === "webhook_not_set" ? t.oaWebhookFail : t.oaWebhook}: <code>{oa.hubWebhookUrl}</code>
            </p>
          )}
          {groupsError && <div className="notice error">{t.unreachable}</div>}
          {groups.length === 0 && <p className="body">{t.noGroups}</p>}
          {groups.map((g) => (
            <div key={g.groupId} className="workrow" style={{ flexWrap: "wrap" }}>
              <span className="wtitle">
                <b>{g.name}</b>
                <small>{g.status === "left" ? (g.channel === "discord" ? t.discordLeft : t.groupLeft) : `${NAMES[g.channel] ?? g.channel} · ${t.connected}`}</small>
              </span>
              {g.status === "connected" && <GroupTestButton slug={slug} groupId={g.groupId} name={g.name} />}
              <form action={unlinkGroup.bind(null, slug, g.groupId)}>
                <ConfirmButton className="btn tiny" message={t.unlinkGroupConfirm(g.name)}>
                  {t.unlink}
                </ConfirmButton>
              </form>
            </div>
          ))}
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            {lineOn ? <ConnectGroupButton slug={slug} oaName={oa?.botName ?? undefined} /> : <span className="chip warn">{t.lineSoon}</span>}
            <AddDiscordGroupForm slug={slug} />
          </div>
          <p className="body" style={{ marginTop: 12, fontSize: 13 }}>{t.telegramSoon}</p>
          {lineOn && <p className="body" style={{ marginTop: 4, fontSize: 13 }}>{t.quota}</p>}
        </>
      )}
    </article>
  );
}
