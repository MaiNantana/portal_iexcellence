"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { oauthLogin, passwordLogin, requestCode, setPasswordWithCode } from "@/app/login-actions";
import { defineText } from "@/i18n";
import { useLocale } from "@/i18n/client";

const TEXT = defineText({
  th: {
    working: "กำลังดำเนินการ...",
    google: "เข้าสู่ระบบด้วย Google",
    microsoft: "เข้าสู่ระบบด้วย Microsoft",
    orEmail: "หรือใช้อีเมล",
    email: "อีเมล",
    password: "รหัสผ่าน",
    signIn: "เข้าสู่ระบบ",
    signingIn: "กำลังเข้าสู่ระบบ...",
    remember: "จดจำการเข้าสู่ระบบ",
    noAccount: "ยังไม่มีบัญชี หรือลืมรหัสผ่าน?",
    setupLink: "สมัคร / ตั้งรหัสผ่านด้วยรหัสทางอีเมล",
    codeLead: "กรอกอีเมลของคุณ เราจะส่งรหัส 6 หลักไปยืนยันอีเมลก่อนตั้งรหัสผ่าน",
    sendCode: "ส่งรหัสยืนยัน",
    sending: "กำลังส่ง...",
    codeSentA: "ส่งรหัส 6 หลักไปที่",
    codeSentB: "แล้ว (ใช้ได้ 10 นาที)",
    code: "รหัสยืนยัน",
    newPassword: "รหัสผ่านใหม่",
    confirmPassword: "ยืนยันรหัสผ่านใหม่",
    rule: "อย่างน้อย 10 ตัวอักษร มีทั้งตัวอักษรและตัวเลข",
    setAndSignIn: "ตั้งรหัสผ่านและเข้าสู่ระบบ",
  },
  en: {
    working: "Working...",
    google: "Sign in with Google",
    microsoft: "Sign in with Microsoft",
    orEmail: "or use your email",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in...",
    remember: "Remember me",
    noAccount: "No account yet, or forgot your password?",
    setupLink: "Sign up / set a password with an email code",
    codeLead: "Enter your email. We'll send a 6-digit code to confirm it before you set a password.",
    sendCode: "Send code",
    sending: "Sending...",
    codeSentA: "We sent a 6-digit code to",
    codeSentB: "(valid for 10 minutes)",
    code: "Code",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    rule: "At least 10 characters, with both letters and numbers",
    setAndSignIn: "Set password and sign in",
  },
});

/** Checked by default. Unchecked: signed out when the browser closes (and after 8 hours at most). */
function RememberBox({ checked, onChange }: { checked?: boolean; onChange?: (v: boolean) => void }) {
  const t = TEXT[useLocale()];
  return (
    <label className="remember">
      <input
        type="checkbox"
        name="remember"
        {...(onChange ? { checked, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked) } : { defaultChecked: true })}
      />
      {t.remember}
    </label>
  );
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  const t = TEXT[useLocale()];
  return (
    <button className="btn primary" style={{ width: "100%", padding: 12 }} disabled={pending}>
      {pending ? (pendingLabel ?? t.working) : label}
    </button>
  );
}

export function SignInForm({ google, microsoft, next, passwordHref }: { google: boolean; microsoft: boolean; next: string; passwordHref: string }) {
  const t = TEXT[useLocale()];
  const [state, action] = useActionState(passwordLogin, undefined);
  const [remember, setRemember] = useState(true);
  // The SSO buttons are their own forms: they carry the same checkbox's value.
  const rememberField = remember ? <input type="hidden" name="remember" value="on" /> : null;
  return (
    <>
      {(google || microsoft) && (
        <div className="sso-buttons">
          {google && (
            <form action={oauthLogin.bind(null, "google", next)}>
              {rememberField}
              <button className="btn sso">
                <span className="sso-mark google">G</span> {t.google}
              </button>
            </form>
          )}
          {microsoft && (
            <form action={oauthLogin.bind(null, "microsoft-entra-id", next)}>
              {rememberField}
              <button className="btn sso">
                <span className="sso-mark ms">▦</span> {t.microsoft}
              </button>
            </form>
          )}
          <div className="divider"><span>{t.orEmail}</span></div>
        </div>
      )}
      <form action={action} className="login-form">
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="email">{t.email}</label>
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
        </div>
        <div className="field">
          <label htmlFor="password">{t.password}</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <RememberBox checked={remember} onChange={setRemember} />
        {state?.error && <div className="notice error">{state.error}</div>}
        <div style={{ marginTop: 14 }}>
          <Submit label={t.signIn} pendingLabel={t.signingIn} />
        </div>
      </form>
      <p className="login-foot">
        {t.noAccount}{" "}
        <Link href={passwordHref} className="inline-link">
          {t.setupLink}
        </Link>
      </p>
    </>
  );
}

export function PasswordSetupForm({ next }: { next: string }) {
  const t = TEXT[useLocale()];
  const [requested, request] = useActionState(requestCode, undefined);
  const [result, submit] = useActionState(setPasswordWithCode, undefined);
  const step = result?.step ?? requested?.step;
  const email = result?.email ?? requested?.email;

  if (step !== "code" || !email) {
    return (
      <form action={request} className="login-form">
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          {t.codeLead}
        </p>
        <div className="field">
          <label htmlFor="email">{t.email}</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        {(requested?.error || result?.error) && <div className="notice error">{requested?.error ?? result?.error}</div>}
        <div style={{ marginTop: 14 }}>
          <Submit label={t.sendCode} pendingLabel={t.sending} />
        </div>
      </form>
    );
  }

  return (
    <form action={submit} className="login-form">
      <div className="notice">
        {t.codeSentA} <b>{email}</b> {t.codeSentB}
      </div>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="code">{t.code}</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
      </div>
      <div className="field">
        <label htmlFor="password">{t.newPassword}</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <div className="field">
        <label htmlFor="confirm">{t.confirmPassword}</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <p className="low">{t.rule}</p>
      <RememberBox />
      {result?.error && <div className="notice error">{result.error}</div>}
      <div style={{ marginTop: 14 }}>
        <Submit label={t.setAndSignIn} />
      </div>
    </form>
  );
}
