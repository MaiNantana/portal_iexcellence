"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addDiscordGroupAction, requestGroupLinkKey, saveLineChannelAction, requestLinkKey, sendGroupTest, sendTestNotification, type GroupKeyState, type LinkKeyState } from "@/app/notify-actions";
import { defineText } from "@/i18n";
import { useLocale } from "@/i18n/client";

const NAMES = { line: "LINE", telegram: "Telegram" } as const;

const TEXT = defineText({
  th: {
    creating: "กำลังสร้าง...",
    connect: (name: string) => `เชื่อม ${name}`,
    qrAlt: (name: string) => `QR เชื่อม ${name}`,
    scan: "สแกนด้วยมือถือ หรือ",
    openLink: (name: string) => `เปิดลิงก์ ${name}`,
    pressStart: " แล้วกด Start",
    enterEmail: " · กรอกอีเมล",
    portalEmail: "ที่ใช้เข้า Portal",
    code: "รหัส",
    timeLeft: (m: number, s: string) => `เหลือเวลา ${m}:${s} นาที`,
    expired: "รหัสหมดอายุแล้ว",
    newCode: "สร้างรหัสใหม่",
    done: "เชื่อมเสร็จแล้ว รีเฟรช",
    sending: "กำลังส่ง...",
    test: "ส่งข้อความทดสอบถึงฉัน",
    connectGroup: "+ เชื่อมกลุ่ม LINE",
    groupSteps: (oa: string) => `1. เชิญ LINE Official Account "${oa}" เข้ากลุ่ม LINE\n2. พิมพ์คำสั่งนี้ในกลุ่ม (ใช้ได้ 1 กลุ่ม)`,
    useOwnOa: "+ ใช้ LINE OA ของบริษัทเอง",
    replaceOa: "เปลี่ยน token",
    oaSteps:
      "ใน LINE Developers (developers.line.biz) › Provider › Messaging API channel ของ OA บริษัท:\n• Channel ID และ Channel secret: แท็บ Basic settings\n• Channel access token (long-lived): แท็บ Messaging API › Issue\n• ใน LINE Official Account Manager เปิด \"Allow account to join groups and multi-person chats\" และเปิด Use webhook",
    channelId: "Channel ID",
    channelSecret: "Channel secret",
    accessToken: "Channel access token (long-lived)",
    secretNote: "เก็บแบบเข้ารหัส และส่งต่อให้ระบบแจ้งเตือน (Hub) เท่านั้น ไม่แสดงอีก",
    save: "ตรวจกับ LINE แล้วบันทึก",
    saving: "กำลังตรวจ...",
    groupTimeLeft: (h: number, m: number) => `ใช้ได้อีก ${h} ชม. ${m} นาที`,
    addDiscord: "+ เพิ่มช่อง Discord",
    discordSteps: "ใน Discord: คลิกขวาที่ช่อง › Edit Channel › Integrations › Webhooks › New Webhook › Copy Webhook URL แล้ววางด้านล่าง",
    webhookUrl: "Webhook URL",
    groupName: "ชื่อที่แสดง (ไม่บังคับ)",
    add: "เพิ่ม",
    adding: "กำลังเพิ่ม...",
    cancel: "ยกเลิก",
    copy: "คัดลอก",
    copied: "คัดลอกแล้ว",
    groupDone: "บอทตอบยืนยันแล้ว รีเฟรช",
    testGroup: "ทดสอบ",
  },
  en: {
    creating: "Creating...",
    connect: (name: string) => `Connect ${name}`,
    qrAlt: (name: string) => `QR code to connect ${name}`,
    scan: "Scan with your phone, or",
    openLink: (name: string) => `open the ${name} link`,
    pressStart: " and press Start",
    enterEmail: " · enter the email",
    portalEmail: "you use for the Portal",
    code: "Code",
    timeLeft: (m: number, s: string) => `${m}:${s} left`,
    expired: "The code has expired",
    newCode: "New code",
    done: "Done, refresh",
    sending: "Sending...",
    test: "Send me a test message",
    connectGroup: "+ Connect a LINE group",
    groupSteps: (oa: string) => `1. Invite the LINE Official Account "${oa}" into the LINE group\n2. Send this command in the group (works for one group)`,
    useOwnOa: "+ Use our own LINE OA",
    replaceOa: "Replace token",
    oaSteps:
      "In LINE Developers (developers.line.biz) › Provider › your OA's Messaging API channel:\n• Channel ID and Channel secret: Basic settings tab\n• Channel access token (long-lived): Messaging API tab › Issue\n• In LINE Official Account Manager, turn on \"Allow account to join groups and multi-person chats\" and Use webhook",
    channelId: "Channel ID",
    channelSecret: "Channel secret",
    accessToken: "Channel access token (long-lived)",
    secretNote: "Stored encrypted and passed only to the notification service (Hub). It is never shown again.",
    save: "Check with LINE and save",
    saving: "Checking...",
    groupTimeLeft: (h: number, m: number) => `Valid for ${h} h ${m} min`,
    addDiscord: "+ Add a Discord channel",
    discordSteps: "In Discord: right-click the channel › Edit Channel › Integrations › Webhooks › New Webhook › Copy Webhook URL, then paste it below.",
    webhookUrl: "Webhook URL",
    groupName: "Display name (optional)",
    add: "Add",
    adding: "Adding...",
    cancel: "Cancel",
    copy: "Copy",
    copied: "Copied",
    groupDone: "The bot confirmed, refresh",
    testGroup: "Test",
  },
});

/** "Connect LINE / Telegram": asks the Hub for a one-time key and shows its QR, link and time left. */
export function ConnectChannelButton({ slug, channel, label }: { slug: string; channel: "line" | "telegram"; label?: string }) {
  const t = TEXT[useLocale()];
  const [state, setState] = useState<LinkKeyState | null>(null);
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state?.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state?.expiresAt]);

  const request = () => start(async () => setState(await requestLinkKey(slug, channel)));
  const left = state?.expiresAt ? Math.max(0, Math.floor((Date.parse(state.expiresAt) - now) / 1000)) : 0;

  if (!state?.qr) {
    return (
      <span>
        <button type="button" className="btn tiny primary" onClick={request} disabled={pending}>
          {pending ? t.creating : (label ?? t.connect(NAMES[channel]))}
        </button>
        {state?.error && <span className="notice error" style={{ display: "block", marginTop: 8 }}>{state.error}</span>}
      </span>
    );
  }

  return (
    <div className="card" style={{ padding: 16, marginTop: 12, textAlign: "center", width: "100%" }}>
      {left > 0 ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt={t.qrAlt(NAMES[channel])} width={200} height={200} style={{ margin: "0 auto" }} />
          <p className="body" style={{ margin: "8px 0" }}>
            {t.scan}{" "}
            <a href={state.url} target="_blank" rel="noopener noreferrer" className="inline-link">
              {t.openLink(NAMES[channel])}
            </a>
            {channel === "telegram" ? t.pressStart : ""}{t.enterEmail} <b>{t.portalEmail}</b>
          </p>
          <p className="body">
            {t.code} <b>{state.key}</b> · {t.timeLeft(Math.floor(left / 60), String(left % 60).padStart(2, "0"))}
          </p>
        </>
      ) : (
        <p className="body">{t.expired}</p>
      )}
      <div className="form-actions" style={{ justifyContent: "center" }}>
        <button type="button" className="btn tiny" onClick={request} disabled={pending}>
          {t.newCode}
        </button>
        <a href="" className="btn tiny primary">
          {t.done}
        </a>
      </div>
    </div>
  );
}

export function TestNotificationButton({ slug }: { slug: string }) {
  const t = TEXT[useLocale()];
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => setMsg(await sendTestNotification(slug)))}>
        {pending ? t.sending : t.test}
      </button>
      {msg?.ok && <div className="notice ok">{msg.ok}</div>}
      {msg?.error && <div className="notice error">{msg.error}</div>}
    </div>
  );
}

/** Admins: "Connect a LINE group" → the `/register <code>` command to send in the group (24 hours). */
export function ConnectGroupButton({ slug, oaName = "Iex.Notification" }: { slug: string; oaName?: string }) {
  const t = TEXT[useLocale()];
  const [state, setState] = useState<GroupKeyState | null>(null);
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!state?.expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state?.expiresAt]);

  const request = () => start(async () => { setCopied(false); setState(await requestGroupLinkKey(slug)); });
  const left = state?.expiresAt ? Math.max(0, Math.floor((Date.parse(state.expiresAt) - now) / 1000)) : 0;

  if (!state?.command) {
    return (
      <div>
        <button type="button" className="btn tiny primary" onClick={request} disabled={pending}>
          {pending ? t.creating : t.connectGroup}
        </button>
        {state?.error && <span className="notice error" style={{ display: "block", marginTop: 8 }}>{state.error}</span>}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 16, marginTop: 12, width: "100%" }}>
      {left > 0 ? (
        <>
          <p className="body" style={{ margin: "0 0 10px", whiteSpace: "pre-line" }}>{t.groupSteps(oaName)}</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ fontSize: 20, fontWeight: 700, padding: "8px 14px", background: "var(--soft)", borderRadius: 8, letterSpacing: 1 }}>{state.command}</code>
            <button
              type="button"
              className="btn tiny"
              onClick={() => navigator.clipboard?.writeText(state.command!).then(() => setCopied(true)).catch(() => {})}
            >
              {copied ? t.copied : t.copy}
            </button>
          </div>
          <p className="body" style={{ margin: "10px 0 0" }}>
            {left >= 3600 ? t.groupTimeLeft(Math.floor(left / 3600), Math.floor((left % 3600) / 60)) : t.timeLeft(Math.floor(left / 60), String(left % 60).padStart(2, "0"))}
          </p>
        </>
      ) : (
        <p className="body">{t.expired}</p>
      )}
      <div className="form-actions">
        <button type="button" className="btn tiny" onClick={request} disabled={pending}>
          {t.newCode}
        </button>
        <a href="" className="btn tiny primary">
          {t.groupDone}
        </a>
      </div>
    </div>
  );
}

export function GroupTestButton({ slug, groupId, name }: { slug: string; groupId: string; name: string }) {
  const t = TEXT[useLocale()];
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <span>
      <button type="button" className="btn tiny" disabled={pending} onClick={() => start(async () => setMsg(await sendGroupTest(slug, groupId, name)))}>
        {pending ? t.sending : t.testGroup}
      </button>
      {msg?.ok && <span className="notice ok" style={{ display: "block", marginTop: 6 }}>{msg.ok}</span>}
      {msg?.error && <span className="notice error" style={{ display: "block", marginTop: 6 }}>{msg.error}</span>}
    </span>
  );
}

/** Admins: "Add a Discord channel" → paste the channel's webhook URL. */
export function AddDiscordGroupForm({ slug }: { slug: string }) {
  const t = TEXT[useLocale()];
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addDiscordGroupAction.bind(null, slug), null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button type="button" className="btn tiny primary" onClick={() => setOpen(true)}>
        {t.addDiscord}
      </button>
    );
  }
  return (
    <form ref={form} action={action} className="card" style={{ padding: 16, marginTop: 12, width: "100%" }}>
      <p className="body" style={{ margin: "0 0 10px" }}>{t.discordSteps}</p>
      <div className="field">
        <label htmlFor="dg-url">{t.webhookUrl}</label>
        <input id="dg-url" name="url" type="url" required autoComplete="off" placeholder="https://discord.com/api/webhooks/…" />
      </div>
      <div className="field">
        <label htmlFor="dg-name">{t.groupName}</label>
        <input id="dg-name" name="name" maxLength={100} />
      </div>
      {state?.error && <div className="notice error">{state.error}</div>}
      <div className="form-actions">
        <button type="button" className="btn tiny" onClick={() => setOpen(false)}>
          {t.cancel}
        </button>
        <button className="btn tiny primary" disabled={pending}>
          {pending ? t.adding : t.add}
        </button>
      </div>
    </form>
  );
}

/** A company admin enters the company's own LINE OA (used for groups instead of Iex.Notification). */
export function LineOaForm({ slug, replacing = false }: { slug: string; replacing?: boolean }) {
  const t = TEXT[useLocale()];
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveLineChannelAction.bind(null, slug), null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button type="button" className={`btn tiny${replacing ? "" : " primary"}`} onClick={() => setOpen(true)}>
        {replacing ? t.replaceOa : t.useOwnOa}
      </button>
    );
  }
  return (
    <form ref={form} action={action} className="card" style={{ padding: 16, marginTop: 12, width: "100%" }}>
      <p className="body" style={{ margin: "0 0 10px", whiteSpace: "pre-line" }}>{t.oaSteps}</p>
      <div className="field">
        <label htmlFor="oa-id">{t.channelId}</label>
        <input id="oa-id" name="channelId" required inputMode="numeric" autoComplete="off" maxLength={20} />
      </div>
      <div className="field">
        <label htmlFor="oa-secret">{t.channelSecret}</label>
        <input id="oa-secret" name="channelSecret" type="password" required autoComplete="off" maxLength={64} />
      </div>
      <div className="field">
        <label htmlFor="oa-token">{t.accessToken}</label>
        <input id="oa-token" name="accessToken" type="password" required autoComplete="off" maxLength={1000} />
      </div>
      <p className="body" style={{ margin: "0 0 10px", fontSize: 13 }}>{t.secretNote}</p>
      {state?.error && <div className="notice error">{state.error}</div>}
      <div className="form-actions">
        <button type="button" className="btn tiny" onClick={() => setOpen(false)}>
          {t.cancel}
        </button>
        <button className="btn tiny primary" disabled={pending}>
          {pending ? t.saving : t.save}
        </button>
      </div>
    </form>
  );
}
