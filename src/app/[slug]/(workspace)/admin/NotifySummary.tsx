import Link from "next/link";
import { db } from "@/lib/db";
import { discordConfigured } from "@/lib/discord";
import { companyGroups } from "@/lib/groups";
import { hubConfigured, hubGroupsEnabled, hubLinks, type HubUserChannels } from "@/lib/hub";
import { lineChannelSummary } from "@/lib/line-oa";
import { defineText, type Locale } from "@/i18n";

// Admin Console › Notifications: one page that shows how the company is connected to LINE / Telegram /
// Discord (company channels, groups, and which members can receive notifications), like the "overview"
// of the Multi-Channel Broadcast demo. Read-only; changes are made on /notifications.

const TEXT = defineText({
  th: {
    lead: "สรุปช่องทางแจ้งเตือนของบริษัท: กลุ่มที่เชื่อมไว้ และสมาชิกที่รับแจ้งเตือนทาง LINE / Telegram / Discord ได้",
    manage: "จัดการช่องทางและกลุ่ม ›",
    stats: { groups: "กลุ่มที่เชื่อมไว้", reachable: "สมาชิกที่รับแจ้งเตือนได้", line: "เชื่อม LINE", telegram: "เชื่อม Telegram", discord: "เชื่อม Discord" },
    ofMembers: (n: number) => `จากสมาชิก ${n} คน`,
    groupsLeft: (n: number) => `บอทออกจากกลุ่ม ${n}`,
    channels: "ช่องทางที่เชื่อมต่อ",
    personal: "ส่วนตัว",
    groupsWord: "กลุ่ม",
    line: (oa: string) => `ส่วนตัว: บัญชี Iex.Notification · กลุ่ม: ${oa}`,
    telegram: "ส่วนตัว: บอท iExcellence · กลุ่ม: เร็ว ๆ นี้",
    discord: "ส่วนตัว: DM จากบอท iExcellence · ช่อง: Webhook ของช่อง",
    count: (n: number) => `${n} กลุ่ม`,
    on: "เปิดใช้งาน",
    off: "ยังไม่เปิด",
    soon: "เร็ว ๆ นี้",
    oaWaiting: "OA ของบริษัทรอ Hub รองรับ",
    groups: "กลุ่มและช่อง",
    noGroups: "ยังไม่มีกลุ่มที่เชื่อมไว้",
    connected: "เชื่อมแล้ว",
    left: "บอทออกแล้ว",
    members: "สมาชิกและช่องทางส่วนตัว",
    member: "สมาชิก",
    none: "ยังไม่เชื่อมช่องทางใด",
    blocked: "บล็อก",
    unreachable: "ติดต่อระบบแจ้งเตือน (Hub) ไม่ได้ ข้อมูล LINE / Telegram อาจไม่ครบ",
    note: "สถานะ \"เชื่อมแล้ว\" หมายถึงระบบส่งข้อความถึงได้ ไม่ได้แปลว่าผู้รับอ่านแล้ว · LINE นับโควตาตามจำนวนสมาชิกในกลุ่ม",
  },
  en: {
    lead: "How your company receives notifications: connected groups, and which members can be reached on LINE / Telegram / Discord.",
    manage: "Manage channels and groups ›",
    stats: { groups: "Connected groups", reachable: "Members reachable", line: "On LINE", telegram: "On Telegram", discord: "On Discord" },
    ofMembers: (n: number) => `of ${n} members`,
    groupsLeft: (n: number) => `bot left ${n}`,
    channels: "Connected channels",
    personal: "Personal",
    groupsWord: "Groups",
    line: (oa: string) => `Personal: Iex.Notification account · Groups: ${oa}`,
    telegram: "Personal: iExcellence bot · Groups: coming soon",
    discord: "Personal: DMs from the iExcellence bot · Channels: channel webhooks",
    count: (n: number) => `${n} groups`,
    on: "On",
    off: "Not set up",
    soon: "Coming soon",
    oaWaiting: "Company OA waiting for the Hub",
    groups: "Groups and channels",
    noGroups: "No groups connected yet",
    connected: "Connected",
    left: "Bot left",
    members: "Members and personal channels",
    member: "Member",
    none: "No channel connected",
    blocked: "blocked",
    unreachable: "Can't reach the notification service (Hub); LINE / Telegram details may be missing.",
    note: "\"Connected\" means messages can be delivered, not that they were read · LINE counts quota per group member.",
  },
});

const NAMES = { line: "LINE", telegram: "Telegram", discord: "Discord" } as const;

function personal(links: HubUserChannels | undefined, channel: "line" | "telegram") {
  const s = links?.channels?.[channel]?.status;
  return s === "connected" || s === "blocked" ? s : null;
}

export async function NotifySummary({ org, base, locale }: { org: { id: string; slug: string; name: string }; base: string; locale: Locale }) {
  const t = TEXT[locale];

  const [members, groupsResult, oa] = await Promise.all([
    db.membership.findMany({
      where: { orgId: org.id },
      include: { user: { select: { id: true, email: true, name: true, discord: { select: { username: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    companyGroups(org),
    lineChannelSummary(org.id),
  ]);
  const { groups } = groupsResult;

  let links = new Map<string, HubUserChannels>();
  let hubError = groupsResult.hubError;
  if (hubConfigured()) {
    try {
      links = await hubLinks(org.slug);
    } catch (err) {
      console.error("[admin] Hub links failed:", err);
      hubError = true;
    }
  }

  const rows = members.map((m) => {
    const l = links.get(m.userId);
    return { m, line: personal(l, "line"), telegram: personal(l, "telegram"), discord: Boolean(m.user.discord) };
  });
  const reachable = rows.filter((r) => r.line === "connected" || r.telegram === "connected" || r.discord).length;
  const onLine = rows.filter((r) => r.line).length;
  const onTelegram = rows.filter((r) => r.telegram).length;
  const onDiscord = rows.filter((r) => r.discord).length;
  const liveGroups = groups.filter((g) => g.status === "connected");
  const leftGroups = groups.length - liveGroups.length;
  const lineGroups = groups.filter((g) => g.channel === "line").length;
  const discordGroups = groups.filter((g) => g.channel === "discord").length;
  // People with nothing connected go last, so the admin sees who still has to set up.
  rows.sort((a, b) => Number(!(a.line || a.telegram || a.discord)) - Number(!(b.line || b.telegram || b.discord)));

  const oaName = oa ? (oa.botName ?? oa.basicId ?? "LINE OA") : "Iex.Notification";
  const status = (on: boolean, soon = false) => <span className={`chip ${on ? "" : soon ? "blue" : "gray"}`}>{on ? t.on : soon ? t.soon : t.off}</span>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
        <p className="muted" style={{ margin: 0, maxWidth: 620 }}>{t.lead}</p>
        <Link href={`${base}/notifications`} className="btn tiny primary">
          {t.manage}
        </Link>
      </div>
      {hubError && <div className="notice error">{t.unreachable}</div>}

      <div className="hrstats" style={{ marginBottom: 16 }}>
        <div className="hrstat">
          <span>{t.stats.groups}</span>
          <b>{liveGroups.length}</b>
          <small>{leftGroups ? t.groupsLeft(leftGroups) : `LINE ${lineGroups} · Discord ${discordGroups}`}</small>
        </div>
        <div className="hrstat">
          <span>{t.stats.reachable}</span>
          <b>{reachable}</b>
          <small>{t.ofMembers(members.length)}</small>
        </div>
        <div className="hrstat">
          <span>{t.stats.line}</span>
          <b>{onLine}</b>
          <small>{t.ofMembers(members.length)}</small>
        </div>
        <div className="hrstat">
          <span>{t.stats.telegram}</span>
          <b>{onTelegram}</b>
          <small>{t.ofMembers(members.length)}</small>
        </div>
        <div className="hrstat">
          <span>{t.stats.discord}</span>
          <b>{onDiscord}</b>
          <small>{t.ofMembers(members.length)}</small>
        </div>
      </div>

      <div className="two-col">
        <section className="card panel">
          <h3 style={{ marginTop: 0 }}>{t.channels}</h3>
          <div className="adcard">
            <div style={{ minWidth: 0 }}>
              <b>LINE</b>
              <small>{t.line(oaName)}</small>
              {oa && !oa.hubSyncedAt && <small>{t.oaWaiting}</small>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {status(hubConfigured())}
              {hubGroupsEnabled() && <span className="chip gray">{t.count(lineGroups)}</span>}
            </div>
          </div>
          <div className="adcard">
            <div style={{ minWidth: 0 }}>
              <b>Discord</b>
              <small>{t.discord}</small>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {status(discordConfigured())}
              <span className="chip gray">{t.count(discordGroups)}</span>
            </div>
          </div>
          <div className="adcard">
            <div style={{ minWidth: 0 }}>
              <b>Telegram</b>
              <small>{t.telegram}</small>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {status(hubConfigured())}
              {status(false, true)}
            </div>
          </div>

          <h3>{t.groups}</h3>
          {groups.length === 0 && <p className="muted">{t.noGroups}</p>}
          {groups.map((g) => (
            <div className="adcard" key={g.groupId}>
              <div style={{ minWidth: 0 }}>
                <b>{g.name}</b>
                <small>{NAMES[g.channel]}</small>
              </div>
              <span className={`chip ${g.status === "connected" ? "" : "warn"}`}>{g.status === "connected" ? t.connected : t.left}</span>
            </div>
          ))}
        </section>

        <section className="card panel">
          <h3 style={{ marginTop: 0 }}>{t.members}</h3>
          {rows.map(({ m, line, telegram, discord }) => (
            <div className="adcard" key={m.id}>
              <div style={{ minWidth: 0 }}>
                <b>{m.user.name || m.user.email}</b>
                {m.user.name && <small>{m.user.email}</small>}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {line && <span className={`chip ${line === "blocked" ? "warn" : ""}`}>LINE{line === "blocked" ? ` · ${t.blocked}` : ""}</span>}
                {telegram && <span className={`chip ${telegram === "blocked" ? "warn" : "blue"}`}>Telegram{telegram === "blocked" ? ` · ${t.blocked}` : ""}</span>}
                {discord && <span className="chip blue">Discord</span>}
                {!line && !telegram && !discord && <span className="chip gray">{t.none}</span>}
              </div>
            </div>
          ))}
        </section>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>{t.note}</p>
    </>
  );
}
