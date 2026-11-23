import Link from "next/link";
import { logout } from "@/app/actions";
import { createOrg, goToJoinCode } from "@/app/org-actions";
import { ActionForm } from "@/components/ActionForm";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";
import { Logo } from "@/components/Logo";
import { defineText, withLocale } from "@/i18n";
import { LanguageSwitch } from "@/i18n/client";
import { getLocale } from "@/i18n/server";

const TEXT = defineText({
  th: {
    welcome: "ยินดีต้อนรับ",
    signedInAs: "เข้าสู่ระบบเป็น",
    noCompany: " · บัญชีนี้ยังไม่ได้อยู่ในบริษัทใด",
    back: "‹ กลับไปที่ Workspace",
    requestSentA: "ส่งคำขอเข้าร่วม",
    requestSentB: "แล้ว · รอ Admin อนุมัติ",
    haveLink: "มีลิงก์หรือรหัสเข้าร่วมบริษัท",
    next: "ไปต่อ",
    linkPlaceholder: "วางลิงก์เข้าร่วม หรือรหัสที่ได้จาก Admin",
    linkLabel: "ลิงก์หรือรหัสเข้าร่วม",
    createTitle: "สร้างบริษัทใหม่",
    createLead: "คุณจะเป็น Admin และเชิญพนักงานได้ด้วยอีเมล โดเมนอีเมลบริษัท หรือลิงก์เข้าร่วม",
    create: "สร้างบริษัท",
    name: "ชื่อบริษัท",
    slug: "รหัสบริษัท (ใช้ใน URL เช่น /abc)",
    slugTitle: "a-z, 0-9, - และ _ ได้ 3–30 ตัว",
    domainNote: "ถ้าบริษัทของคุณยืนยันโดเมนอีเมลไว้แล้ว (เช่น @บริษัท.co.th) คุณจะเข้าได้อัตโนมัติเมื่อเข้าสู่ระบบด้วยอีเมลนั้น",
    logout: "ออกจากระบบ / ใช้บัญชีอื่น",
  },
  en: {
    welcome: "Welcome",
    signedInAs: "Signed in as",
    noCompany: " · this account is not in any company yet",
    back: "‹ Back to the Workspace",
    requestSentA: "Request to join",
    requestSentB: "sent · waiting for an Admin to approve",
    haveLink: "Have a company join link or code?",
    next: "Continue",
    linkPlaceholder: "Paste the join link, or the code from your Admin",
    linkLabel: "Join link or code",
    createTitle: "Create a new company",
    createLead: "You'll be its Admin and can invite staff by email, company email domain or join link.",
    create: "Create company",
    name: "Company name",
    slug: "Company code (used in the URL, e.g. /abc)",
    slugTitle: "3–30 of a-z, 0-9, - and _",
    domainNote: "If your company has verified its email domain (e.g. @company.co.th), you join automatically when you sign in with that email.",
    logout: "Sign out / use another account",
  },
});

/** Shown at "/" to signed-in people without a company yet, or with ?start=1 to create / join another one. */
export async function Onboarding({ user, hasCompany }: { user: User; hasCompany: boolean }) {
  const locale = await getLocale();
  const t = TEXT[locale];
  const requests = await db.joinRequest.findMany({ where: { userId: user.id }, include: { org: { select: { name: true } } } });

  return (
    <main className="login">
      <div className="card" style={{ maxWidth: 520, textAlign: "left" }}>
        <LanguageSwitch className="login-lang" />
        <Logo className="logo logo-inline" />
        <h2>{t.welcome}</h2>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 6px" }}>
          {t.signedInAs} <b>{user.email}</b>
          {!hasCompany && t.noCompany}
        </p>
        {hasCompany && (
          <Link href={withLocale(locale, "/")} className="inline-link">{t.back}</Link>
        )}

        {requests.map((r) => (
          <div key={r.id} className="notice" style={{ marginTop: 12 }}>
            {t.requestSentA} <b>{r.org.name}</b> {t.requestSentB}
          </div>
        ))}

        <div className="launcher-group">{t.haveLink}</div>
        <ActionForm action={goToJoinCode} submitLabel={t.next} resetOnSuccess={false}>
          <div className="field" style={{ margin: 0 }}>
            <input name="code" required placeholder={t.linkPlaceholder} aria-label={t.linkLabel} />
          </div>
        </ActionForm>

        <div className="launcher-group">{t.createTitle}</div>
        <p className="low" style={{ marginTop: 0 }}>{t.createLead}</p>
        <ActionForm action={createOrg} submitLabel={t.create} resetOnSuccess={false}>
          <div className="field" style={{ margin: 0 }}>
            <input name="name" required minLength={2} maxLength={100} placeholder={t.name} aria-label={t.name} />
          </div>
          <div className="field">
            <label htmlFor="new-slug">{t.slug}</label>
            <input id="new-slug" name="slug" required autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="abc" title={t.slugTitle} />
          </div>
        </ActionForm>

        <p className="notice" style={{ marginTop: 18 }}>{t.domainNote}</p>
        <form action={logout.bind(null, null)} style={{ marginTop: 12 }}>
          <button className="inline-link">{t.logout}</button>
        </form>
      </div>
    </main>
  );
}
