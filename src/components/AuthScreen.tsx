import Link from "next/link";
import { googleEnabled, microsoftEnabled } from "@/auth";
import { PasswordSetupForm, SignInForm } from "@/components/LoginForms";
import { Logo } from "@/components/Logo";
import { defineText, withLocale } from "@/i18n";
import { LanguageSwitch } from "@/i18n/client";
import { getLocale } from "@/i18n/server";

const TEXT = defineText({
  th: {
    errors: { unverified: "ผู้ให้บริการไม่ได้ยืนยันอีเมลของบัญชีนี้ กรุณาใช้บัญชีอื่นหรือเข้าสู่ระบบด้วยอีเมล" } as Record<string, string>,
    failed: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",
    setupTitle: "สมัคร / ตั้งรหัสผ่าน",
    setupLead: "สำหรับผู้ใช้ใหม่ หรือเมื่อลืมรหัสผ่าน",
    orgLead: "Company Workspace · เข้าสู่ระบบเพื่อใช้ Portal, HR และ Task",
    lead: "เข้าสู่ระบบครั้งเดียว เพื่อใช้ Portal, HR และ Task",
    back: "‹ กลับไปหน้าเข้าสู่ระบบ",
  },
  en: {
    errors: { unverified: "The provider has not verified this account's email. Use another account or sign in with your email." },
    failed: "Sign-in failed. Please try again.",
    setupTitle: "Sign up / set a password",
    setupLead: "For new users, or if you forgot your password",
    orgLead: "Company Workspace · sign in to use Portal, HR and Task",
    lead: "Sign in once to use Portal, HR and Task",
    back: "‹ Back to sign-in",
  },
});

/**
 * Sign-in / set-password card. `loginBase` is "/" for the global login or "/abc/login" for a
 * company's own login page (which shows the company name and returns to that company).
 */
export async function AuthScreen({
  mode,
  next,
  loginBase,
  orgName,
  error,
}: {
  mode: "signin" | "password";
  next: string;
  loginBase: string;
  orgName?: string;
  error?: string;
}) {
  const locale = await getLocale();
  const t = TEXT[locale];
  const q = `next=${encodeURIComponent(next)}`;
  const passwordHref = withLocale(locale, loginBase === "/" ? `/?mode=password&${q}` : `${loginBase}/password?${q}`);
  const signinHref = withLocale(locale, `${loginBase}?${q}`);

  return (
    <main className="login">
      <div className="card">
        <LanguageSwitch className="login-lang" />
        <Logo />
        <h2>{mode === "password" ? t.setupTitle : orgName ?? "Company Workspace"}</h2>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 22px" }}>
          {mode === "password" ? t.setupLead : orgName ? t.orgLead : t.lead}
        </p>
        {error && (
          <div className="notice error" style={{ marginBottom: 16 }}>
            {t.errors[error] ?? t.failed}
          </div>
        )}
        {mode === "password" ? (
          <>
            <PasswordSetupForm next={next} />
            <p className="login-foot">
              <Link href={signinHref} className="inline-link">{t.back}</Link>
            </p>
          </>
        ) : (
          <SignInForm google={googleEnabled} microsoft={microsoftEnabled} next={next} passwordHref={passwordHref} />
        )}
      </div>
    </main>
  );
}
