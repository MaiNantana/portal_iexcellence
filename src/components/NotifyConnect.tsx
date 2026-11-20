"use client";

import { useEffect, useState, useTransition } from "react";
import { requestLinkKey, sendTestNotification, type LinkKeyState } from "@/app/notify-actions";

const NAMES = { line: "LINE", telegram: "Telegram" } as const;

/** "Connect LINE / Telegram": asks the Hub for a one-time key and shows its QR, link and time left. */
export function ConnectChannelButton({ slug, channel, label }: { slug: string; channel: "line" | "telegram"; label?: string }) {
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
          {pending ? "กำลังสร้าง..." : (label ?? `เชื่อม ${NAMES[channel]}`)}
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
          <img src={state.qr} alt={`QR เชื่อม ${NAMES[channel]}`} width={200} height={200} style={{ margin: "0 auto" }} />
          <p className="body" style={{ margin: "8px 0" }}>
            สแกนด้วยมือถือ หรือ{" "}
            <a href={state.url} target="_blank" rel="noopener noreferrer" className="inline-link">
              เปิดลิงก์ {NAMES[channel]}
            </a>
            {channel === "telegram" ? " แล้วกด Start" : ""} · กรอกอีเมล <b>ที่ใช้เข้า Portal</b>
          </p>
          <p className="body">
            รหัส <b>{state.key}</b> · เหลือเวลา {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} นาที
          </p>
        </>
      ) : (
        <p className="body">รหัสหมดอายุแล้ว</p>
      )}
      <div className="form-actions" style={{ justifyContent: "center" }}>
        <button type="button" className="btn tiny" onClick={request} disabled={pending}>
          สร้างรหัสใหม่
        </button>
        <a href="" className="btn tiny primary">
          เชื่อมเสร็จแล้ว รีเฟรช
        </a>
      </div>
    </div>
  );
}

export function TestNotificationButton({ slug }: { slug: string }) {
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button type="button" className="btn" disabled={pending} onClick={() => start(async () => setMsg(await sendTestNotification(slug)))}>
        {pending ? "กำลังส่ง..." : "ส่งข้อความทดสอบถึงฉัน"}
      </button>
      {msg?.ok && <div className="notice ok">{msg.ok}</div>}
      {msg?.error && <div className="notice error">{msg.error}</div>}
    </div>
  );
}
