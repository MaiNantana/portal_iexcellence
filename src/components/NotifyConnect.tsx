"use client";

import { useEffect, useState, useTransition } from "react";
import { requestLinkKey, sendTestNotification, type LinkKeyState } from "@/app/notify-actions";
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
