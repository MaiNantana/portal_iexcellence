"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/auth";
import { safeNext } from "@/lib/context";
import { db } from "@/lib/db";
import { consumeEmailCode, createEmailCode, hashPassword, normalizeEmail, syncMemberships, validatePassword } from "@/lib/identity";
import { sendMail } from "@/lib/mail";

export type LoginState = { error?: string; email?: string; step?: "code" } | undefined;

const PASSWORD_ERRORS: Record<string, string> = {
  invalid: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  locked: "ใส่รหัสผ่านผิดหลายครั้ง บัญชีถูกล็อกชั่วคราว 15 นาที หรือรีเซ็ตรหัสผ่านด้วยรหัสทางอีเมล",
  unverified: "ยังไม่ได้ยืนยันอีเมล กรุณาตั้งรหัสผ่านผ่านรหัสยืนยันทางอีเมล",
};

export async function passwordLogin(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  try {
    await signIn("credentials", { email, password: form.get("password"), redirectTo: safeNext(form.get("next")) });
  } catch (e) {
    if (e instanceof AuthError) {
      const code = (e as AuthError & { code?: string }).code ?? "invalid";
      return { error: PASSWORD_ERRORS[code] ?? PASSWORD_ERRORS.invalid, email };
    }
    throw e; // the success redirect is thrown, too
  }
}

export async function oauthLogin(provider: "google" | "microsoft-entra-id", next: string) {
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
  const email = normalizeEmail(form.get("email"));
  if (!email) return { error: "กรุณากรอกอีเมลให้ถูกต้อง" };
  if (!(await allowCodeRequest())) return { error: "ขอรหัสบ่อยเกินไป กรุณาลองใหม่ภายหลัง" };
  const code = await createEmailCode(email);
  if (code) {
    await sendMail(email, "รหัสยืนยัน iExcellence Workspace", `รหัสยืนยันของคุณคือ ${code}\nรหัสนี้ใช้ได้ 10 นาที หากคุณไม่ได้ขอรหัสนี้ ไม่ต้องดำเนินการใด ๆ`);
  }
  return { step: "code", email };
}

/** Step 2: proves ownership of the email, then creates the account if needed, sets the password and signs in. */
export async function setPasswordWithCode(_: LoginState, form: FormData): Promise<LoginState> {
  const email = normalizeEmail(form.get("email"));
  const code = String(form.get("code") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email) return { error: "กรุณาเริ่มใหม่อีกครั้ง" };
  const back = { step: "code" as const, email };
  if (password !== form.get("confirm")) return { ...back, error: "รหัสผ่านทั้งสองช่องไม่ตรงกัน" };
  const weak = validatePassword(password);
  if (weak) return { ...back, error: weak };
  if (!(await consumeEmailCode(email, code))) return { ...back, error: "รหัสยืนยันไม่ถูกต้องหรือหมดอายุ" };

  const user = await db.user.upsert({ where: { email }, update: {}, create: { email } });
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), emailVerifiedAt: user.emailVerifiedAt ?? new Date(), failedLogins: 0, lockedUntil: null },
  });
  await syncMemberships(user.id, email);
  return passwordLogin(undefined, form);
}
