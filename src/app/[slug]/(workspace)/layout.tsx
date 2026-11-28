import Link from "next/link";
import { ArrowLeftRight, Bell, BellRing, LogOut, Settings, ShieldAlert, ShieldCheck } from "lucide-react";
import { logout, switchOrg } from "@/app/actions";
import { stopActingAs } from "@/app/superadmin-actions";
import { MobileDock, TopNav } from "@/components/NavLinks";
import { orgPath, realUser, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { getVisibleNews } from "@/lib/portal";
import { Logo } from "@/components/Logo";
import { defineText, withLocale } from "@/i18n";
import { LanguageSwitch } from "@/i18n/client";
import { getLocale } from "@/i18n/server";

const TEXT = defineText({
  th: {
    actingA: "กำลังสวมรอยเป็น",
    actingB: "คุณคือ",
    stopActing: "กลับเป็นตัวเอง",
    pending: (n: number) => `${n} ประกาศที่ยังไม่รับทราบ`,
    noPending: "ไม่มีประกาศที่ต้องรับทราบ",
    channelsTitle: "ช่องทางรับแจ้งเตือน: LINE · Telegram · Discord",
    channels: "ช่องทางรับแจ้งเตือน",
    adminTitle: "จัดการบริษัท: สมาชิก เชิญคน การเชื่อมต่อ",
    admin: "จัดการบริษัท",
    superadmin: "Superadmin: ทุกบริษัทบน Portal",
    pickOrg: "เลือกบริษัท",
    switchOrg: "สลับบริษัท",
    logout: "ออกจากระบบ",
    otherCompany: "สร้าง / เข้าร่วมบริษัทอื่น",
  },
  en: {
    actingA: "Acting as",
    actingB: "you are",
    stopActing: "Back to myself",
    pending: (n: number) => `${n} announcement${n === 1 ? "" : "s"} to acknowledge`,
    noPending: "No announcements to acknowledge",
    channelsTitle: "Notification channels: LINE · Telegram · Discord",
    channels: "Notification channels",
    adminTitle: "Manage company: members, invitations, connections",
    admin: "Manage company",
    superadmin: "Superadmin: every company on the Portal",
    pickOrg: "Choose company",
    switchOrg: "Switch company",
    logout: "Sign out",
    otherCompany: "Create / join another company",
  },
});

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await requireMember(slug);
  const locale = await getLocale();
  const t = TEXT[locale];
  const [{ pending }, orgs, me] = await Promise.all([
    getVisibleNews(member),
    db.membership.findMany({ where: { userId: member.userId }, select: { org: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    realUser(),
  ]);
  const isAdmin = member.role === "ADMIN";
  const base = withLocale(locale, orgPath(slug));

  return (
    <>
      {me?.acting && (
        <div className="actingbar" role="status">
          <ShieldAlert size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            {t.actingA} <b>{me.acting.email}</b> ({t.actingB} {me.user.email})
          </span>
          <form action={stopActingAs}>
            <button className="btn tiny">{t.stopActing}</button>
          </form>
        </div>
      )}
      <header className="top">
        <div className="top-inner">
          <Link href={base} className="brand">
            <Logo />
            <div>
              <h1>{member.org.name}</h1>
              <div className="subbrand">COMPANY WORKSPACE</div>
            </div>
          </Link>
          <TopNav base={base} />
          <div className="righttools">
            <Link href={pending[0] ? `${base}/news/${pending[0].id}` : `${base}#news`} className="iconbtn" title={pending.length ? t.pending(pending.length) : t.noPending}>
              <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
              {pending.length > 0 && <span className="dot" />}
            </Link>
            <Link href={`${base}/notifications`} className="iconbtn" title={t.channelsTitle} aria-label={t.channels}>
              <BellRing size={17} strokeWidth={1.75} aria-hidden="true" />
            </Link>
            {isAdmin && (
              <Link href={`${base}/admin`} className="iconbtn adminbtn" title={t.adminTitle}>
                <Settings size={17} strokeWidth={1.75} aria-hidden="true" />
                <span>{t.admin}</span>
              </Link>
            )}
            {me?.superadmin && (
              <Link href={withLocale(locale, "/superadmin")} className="iconbtn" title={t.superadmin} aria-label="Superadmin">
                <ShieldCheck size={17} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            )}
            {/* On phones this goes to its own row under the logo (globals.css .toolgroup). */}
            <div className="toolgroup">
            {orgs.length > 1 && (
              <form action={switchOrg} className="orgswitch-form">
                <select name="orgId" defaultValue={member.orgId} className="orgswitch" aria-label={t.pickOrg}>
                  {orgs.map(({ org }) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
                <button className="iconbtn" title={t.switchOrg} aria-label={t.switchOrg}><ArrowLeftRight size={17} strokeWidth={1.75} aria-hidden="true" /></button>
              </form>
            )}
            <LanguageSwitch />
            </div>
            <div className="userchip">
              <b>{member.user.name ?? member.user.email}</b>
              <small>{isAdmin ? "Admin" : "Employee"}</small>
            </div>
            <form action={logout.bind(null, slug)}>
              <button className="iconbtn" title={t.logout} aria-label={t.logout}><LogOut size={17} strokeWidth={1.75} aria-hidden="true" /></button>
            </form>
          </div>
        </div>
      </header>
      <MobileDock base={base} />
      <main className="wrap">
        {children}
        <footer className="footer">
          <span>iExcellence Company Workspace · {member.org.name}</span>
          <span>
            {member.user.email} · <Link href={withLocale(locale, "/?start=1")} className="inline-link">{t.otherCompany}</Link>
          </span>
        </footer>
      </main>
    </>
  );
}
