"use server";

import { AuthError } from "next-auth";
import { cookies, headers } from "next/headers";
import { signIn } from "@/auth";
import { safeNext } from "@/lib/context";
import { db } from "@/lib/db";
import { consumeEmailCode, createEmailCode, hashPassword, normalizeEmail, syncMemberships, validatePassword } from "@/lib/identity";
import { sendMail } from "@/lib/mail";
import { BROWSER_COOKIE, REMEMBER_COOKIE } from "@/lib/remember";
import { defineText } from "@/i18n";
import { getLocale } from "@/i18n/server";

export type LoginState = { error?: string; email?: string; step?: "code" } | undefined;

const TEXT = defineText({
  th: {
    passwordErrors: {
      invalid: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
      locked: "ใส่รหัสผ่านผิดหลายครั้ง บัญชีถูกล็อกชั่วคราว 15 นาที หรือรีเซ็ตรหัสผ่านด้วยรหัสทางอีเมล",
      unverified: "ยังไม่ได้ยืนยันอีเมล กรุณาตั้งรหัสผ่านผ่านรหัสยืนยันทางอีเมล",
    } as Record<string, string>,
    badEmail: "กรุณากรอกอีเมลให้ถูกต้อง",
    tooOften: "ขอรหัสบ่อยเกินไป กรุณาลองใหม่ภายหลัง",
    mailSubject: "รหัสยืนยัน iExcellence Workspace",
    mailBody: (code: string) => `รหัสยืนยันของคุณคือ ${code}\nรหัสนี้ใช้ได้ 10 นาที หากคุณไม่ได้ขอรหัสนี้ ไม่ต้องดำเนินการใด ๆ`,
    restart: "กรุณาเริ่มใหม่อีกครั้ง",
    mismatch: "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
    badCode: "รหัสยืนยันไม่ถูกต้องหรือหมดอายุ",
  },
  en: {
    passwordErrors: {
      invalid: "Wrong email or password.",
      locked: "Too many wrong passwords. The account is locked for 15 minutes, or reset the password with an email code.",
      unverified: "This email is not verified yet. Set a password with an email code first.",
    },
    badEmail: "Please enter a valid email.",
    tooOften: "Too many code requests. Please try again later.",
    mailSubject: "iExcellence Workspace verification code",
    mailBody: (code: string) => `Your verification code is ${code}\nIt is valid for 10 minutes. If you did not ask for it, you can ignore this email.`,
    restart: "Please start again.",
    mismatch: "The two passwords do not match.",
    badCode: "The code is wrong or has expired.",
  },
});

/** An unchecked box sends nothing, so the form says "remember=on" when checked. */
async function rememberChoice(form: FormData | undefined) {
  const remember = form?.get("remember") === "on";
  const jar = await cookies();
  if (remember) jar.delete(BROWSER_COOKIE);
  else jar.set(BROWSER_COOKIE, "1", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return remember;
}

export async function passwordLogin(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const remember = await rememberChoice(form);
  try {
    await signIn("credentials", { email, password: form.get("password"), remember: remember ? "1" : "0", redirectTo: safeNext(form.get("next")) });
  } catch (e) {
    if (e instanceof AuthError) {
      const code = (e as AuthError & { code?: string }).code ?? "invalid";
      const errors = TEXT[await getLocale()].passwordErrors;
      return { error: errors[code] ?? errors.invalid, email };
    }
    throw e; // the success redirect is thrown, too
  }
}

export async function oauthLogin(provider: "google" | "microsoft-entra-id", next: string, form?: FormData) {
  const remember = await rememberChoice(form);
  (await cookies()).set(REMEMBER_COOKIE, remember ? "1" : "0", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 600, secure: process.env.NODE_ENV === "production" });
  await signIn(provider, { redirectTo: safeNext(next) });
}

// Sign-up is open, so cap codes per client IP as well as per email (createEmailCode) to keep the
// Portal from being used to spam inboxes. In-memory: fine for the single PM2 instance.
const CODES_PER_IP_PER_HOUR = 10;
const codeRequestsByIp = new Map<string, number[]>();

async function allowCodeRequest() {
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0].trim().replace(/:\d+$/, "") || "local";
  const now = Date.now();
  const recent = (codeRequestsByIp.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= CODES_PER_IP_PER_HOUR) return false;
  codeRequestsByIp.set(ip, [...recent, now]);
  return true;
}

/** Step 1 of sign-up / reset: email a one-time code. */
export async function requestCode(_: LoginState, form: FormData): Promise<LoginState> {
  const t = TEXT[await getLocale()];
  const email = normalizeEmail(form.get("email"));
  if (!email) return { error: t.badEmail };
  if (!(await allowCodeRequest())) return { error: t.tooOften };
  const code = await createEmailCode(email);
  if (code) {
    await sendMail(email, t.mailSubject, t.mailBody(code));
  }
  return { step: "code", email };
}

/** Step 2: proves ownership of the email, then creates the account if needed, sets the password and signs in. */
export async function setPasswordWithCode(_: LoginState, form: FormData): Promise<LoginState> {
  const locale = await getLocale();
  const t = TEXT[locale];
  const email = normalizeEmail(form.get("email"));
  const code = String(form.get("code") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email) return { error: t.restart };
  const back = { step: "code" as const, email };
  if (password !== form.get("confirm")) return { ...back, error: t.mismatch };
  const weak = validatePassword(password, locale);
  if (weak) return { ...back, error: weak };
  if (!(await consumeEmailCode(email, code))) return { ...back, error: t.badCode };

  const user = await db.user.upsert({ where: { email }, update: {}, create: { email } });
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), emailVerifiedAt: user.emailVerifiedAt ?? new Date(), failedLogins: 0, lockedUntil: null },
  });
  await syncMemberships(user.id, email);
  return passwordLogin(undefined, form);
}
