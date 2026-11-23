import Link from "next/link";
import { joinByCode } from "@/app/org-actions";
import { orgPath, requireUser } from "@/lib/context";
import { db } from "@/lib/db";
import { Logo } from "@/components/Logo";
import { defineText, withLocale } from "@/i18n";
import { LanguageSwitch } from "@/i18n/client";
import { getLocale } from "@/i18n/server";

const TEXT = defineText({
  th: {
    invalidTitle: "ลิงก์นี้ใช้ไม่ได้",
    invalidBody: "ลิงก์อาจหมดอายุหรือถูกปิดแล้ว กรุณาขอลิงก์ใหม่จาก Admin ของบริษัท",
    joiningAs: "เข้าร่วมในชื่อ",
    requested: (org: string) => `ส่งคำขอแล้ว · รอ Admin ของ ${org} อนุมัติ`,
    open: "เข้าสู่ Workspace",
    join: "เข้าร่วมบริษัท",
    request: "ส่งคำขอเข้าร่วม",
    start: "ไปหน้าเริ่มต้น",
  },
  en: {
    invalidTitle: "This link doesn't work",
    invalidBody: "It may have expired or been turned off. Ask your company's Admin for a new link.",
    joiningAs: "Joining as",
    requested: (org: string) => `Request sent · waiting for an Admin of ${org} to approve`,
    open: "Open the Workspace",
    join: "Join company",
    request: "Request to join",
    start: "Go to the start page",
  },
});

/** A company join link: /abc/join/<code>. The code must belong to the company in the URL. */
export default async function JoinPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const locale = await getLocale();
  const t = TEXT[locale];
  const user = await requireUser(withLocale(locale, orgPath(slug, `/join/${code}`)));
  const org = await db.org.findFirst({ where: { slug, joinCode: code, joinMode: { not: "OFF" } }, select: { id: true, name: true, joinMode: true } });
  const [member, request] = org
    ? await Promise.all([
        db.membership.findUnique({ where: { orgId_userId: { orgId: org.id, userId: user.id } } }),
        db.joinRequest.findUnique({ where: { orgId_userId: { orgId: org.id, userId: user.id } } }),
      ])
    : [null, null];

  return (
    <main className="login">
      <div className="card">
        <LanguageSwitch className="login-lang" />
        <Logo />
        {!org ? (
          <>
            <h2>{t.invalidTitle}</h2>
            <p className="muted" style={{ fontSize: 13 }}>{t.invalidBody}</p>
          </>
        ) : (
          <>
            <h2>{org.name}</h2>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 18px" }}>
              {t.joiningAs} <b>{user.email}</b>
            </p>
            {request ? (
              <div className="notice">{t.requested(org.name)}</div>
            ) : (
              <form action={joinByCode.bind(null, slug, code)}>
                <button className="btn primary" style={{ width: "100%", padding: 12 }}>
                  {member ? t.open : org.joinMode === "OPEN" ? t.join : t.request}
                </button>
              </form>
            )}
          </>
        )}
        <p className="login-foot">
          <Link href={withLocale(locale, "/?start=1")} className="inline-link">{t.start}</Link>
        </p>
      </div>
    </main>
  );
}
