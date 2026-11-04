import Link from "next/link";
import { googleEnabled, microsoftEnabled } from "@/auth";
import { PasswordSetupForm, SignInForm } from "@/components/LoginForms";

const ERRORS: Record<string, string> = {
  unverified: "ผู้ให้บริการไม่ได้ยืนยันอีเมลของบัญชีนี้ กรุณาใช้บัญชีอื่นหรือเข้าสู่ระบบด้วยอีเมล",
};

/**
 * Sign-in / set-password card. `loginBase` is "/" for the global login or "/abc/login" for a
 * company's own login page (which shows the company name and returns to that company).
 */
export function AuthScreen({
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
  const q = `next=${encodeURIComponent(next)}`;
  const passwordHref = loginBase === "/" ? `/?mode=password&${q}` : `${loginBase}/password?${q}`;
  const signinHref = `${loginBase}?${q}`;

  return (
    <main className="login">
      <div className="card">
        <div className="logo">i</div>
        <h2>{mode === "password" ? "สมัคร / ตั้งรหัสผ่าน" : orgName ?? "Company Workspace"}</h2>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 22px" }}>
          {mode === "password"
            ? "สำหรับผู้ใช้ใหม่ หรือเมื่อลืมรหัสผ่าน"
            : orgName
              ? "Company Workspace · เข้าสู่ระบบเพื่อใช้ Portal, HR และ Task"
              : "เข้าสู่ระบบครั้งเดียว เพื่อใช้ Portal, HR และ Task"}
        </p>
        {error && (
          <div className="notice error" style={{ marginBottom: 16 }}>
            {ERRORS[error] ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"}
          </div>
        )}
        {mode === "password" ? (
          <>
            <PasswordSetupForm next={next} />
            <p className="login-foot">
              <Link href={signinHref} className="inline-link">‹ กลับไปหน้าเข้าสู่ระบบ</Link>
            </p>
          </>
        ) : (
          <SignInForm google={googleEnabled} microsoft={microsoftEnabled} next={next} passwordHref={passwordHref} />
        )}
      </div>
    </main>
  );
}
