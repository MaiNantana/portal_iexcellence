"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { oauthLogin, passwordLogin, requestCode, setPasswordWithCode } from "@/app/login-actions";

function Submit({ label, pendingLabel = "กำลังดำเนินการ..." }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" style={{ width: "100%", padding: 12 }} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function SignInForm({ google, microsoft, next, passwordHref }: { google: boolean; microsoft: boolean; next: string; passwordHref: string }) {
  const [state, action] = useActionState(passwordLogin, undefined);
  return (
    <>
      {(google || microsoft) && (
        <div className="sso-buttons">
          {google && (
            <form action={oauthLogin.bind(null, "google", next)}>
              <button className="btn sso">
                <span className="sso-mark google">G</span> เข้าสู่ระบบด้วย Google
              </button>
            </form>
          )}
          {microsoft && (
            <form action={oauthLogin.bind(null, "microsoft-entra-id", next)}>
              <button className="btn sso">
                <span className="sso-mark ms">▦</span> เข้าสู่ระบบด้วย Microsoft
              </button>
            </form>
          )}
          <div className="divider"><span>หรือใช้อีเมล</span></div>
        </div>
      )}
      <form action={action} className="login-form">
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="email">อีเมล</label>
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
        </div>
        <div className="field">
          <label htmlFor="password">รหัสผ่าน</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state?.error && <div className="notice error">{state.error}</div>}
        <div style={{ marginTop: 14 }}>
          <Submit label="เข้าสู่ระบบ" pendingLabel="กำลังเข้าสู่ระบบ..." />
        </div>
      </form>
      <p className="login-foot">
        ยังไม่มีบัญชี หรือลืมรหัสผ่าน?{" "}
        <Link href={passwordHref} className="inline-link">
          สมัคร / ตั้งรหัสผ่านด้วยรหัสทางอีเมล
        </Link>
      </p>
    </>
  );
}

export function PasswordSetupForm({ next }: { next: string }) {
  const [requested, request] = useActionState(requestCode, undefined);
  const [result, submit] = useActionState(setPasswordWithCode, undefined);
  const step = result?.step ?? requested?.step;
  const email = result?.email ?? requested?.email;

  if (step !== "code" || !email) {
    return (
      <form action={request} className="login-form">
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          กรอกอีเมลของคุณ เราจะส่งรหัส 6 หลักไปยืนยันอีเมลก่อนตั้งรหัสผ่าน
        </p>
        <div className="field">
          <label htmlFor="email">อีเมล</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        {(requested?.error || result?.error) && <div className="notice error">{requested?.error ?? result?.error}</div>}
        <div style={{ marginTop: 14 }}>
          <Submit label="ส่งรหัสยืนยัน" pendingLabel="กำลังส่ง..." />
        </div>
      </form>
    );
  }

  return (
    <form action={submit} className="login-form">
      <div className="notice">
        ส่งรหัส 6 หลักไปที่ <b>{email}</b> แล้ว (ใช้ได้ 10 นาที)
      </div>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="code">รหัสยืนยัน</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
      </div>
      <div className="field">
        <label htmlFor="password">รหัสผ่านใหม่</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <div className="field">
        <label htmlFor="confirm">ยืนยันรหัสผ่านใหม่</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <p className="low">อย่างน้อย 10 ตัวอักษร มีทั้งตัวอักษรและตัวเลข</p>
      {result?.error && <div className="notice error">{result.error}</div>}
      <div style={{ marginTop: 14 }}>
        <Submit label="ตั้งรหัสผ่านและเข้าสู่ระบบ" />
      </div>
    </form>
  );
}
