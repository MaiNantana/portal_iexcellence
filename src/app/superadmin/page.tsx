import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { startActingAs, stopActingAs } from "@/app/superadmin-actions";
import { Logo } from "@/components/Logo";
import { realUser } from "@/lib/context";
import { db } from "@/lib/db";
import { defineText, formatDateTime, withLocale } from "@/i18n";
import { LanguageSwitch } from "@/i18n/client";
import { getLocale } from "@/i18n/server";

export const metadata = { title: "Superadmin · iExcellence Portal" };

const TEXT = defineText({
  th: {
    all: (n: number, found: boolean) => `ทุกบริษัทบน Portal (${n}${found ? " ที่ค้นเจอ" : ""})`,
    stopActing: (email: string) => `เลิกสวมรอย ${email}`,
    searchPlaceholder: "ค้นชื่อบริษัท รหัส หรืออีเมล Admin",
    searchLabel: "ค้นหาบริษัท",
    search: "ค้นหา",
    clear: "ล้าง",
    none: "ไม่พบบริษัท",
    members: (n: number) => `สมาชิก ${n} คน`,
    created: (d: string) => `สร้าง ${d}`,
    noAdmin: "ไม่มี Admin",
    lastLogin: (d: string) => `เข้าใช้ล่าสุด ${d}`,
    neverLoggedIn: "ยังไม่เคยเข้าใช้",
    enter: "เข้าบริษัท",
    actAs: "สวมรอย",
  },
  en: {
    all: (n: number, found: boolean) => `${found ? "Matching companies" : "Every company on the Portal"} (${n})`,
    stopActing: (email: string) => `Stop acting as ${email}`,
    searchPlaceholder: "Search company name, code or Admin email",
    searchLabel: "Search companies",
    search: "Search",
    clear: "Clear",
    none: "No companies found",
    members: (n: number) => `${n} member${n === 1 ? "" : "s"}`,
    created: (d: string) => `created ${d}`,
    noAdmin: "No Admin",
    lastLogin: (d: string) => `last signed in ${d}`,
    neverLoggedIn: "Never signed in",
    enter: "Open company",
    actAs: "Act as",
  },
});

/** Every company on the Portal, for the platform superadmin: open one as any of its admins (สวมรอย). */
export default async function SuperadminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const locale = await getLocale();
  const t = TEXT[locale];
  const me = await realUser();
  if (!me) redirect(withLocale(locale, `/?next=${encodeURIComponent(withLocale(locale, "/superadmin"))}`));
  if (!me.superadmin) notFound();
  const q = String((await searchParams).q ?? "").trim();

  const orgs = await db.org.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { slug: { contains: q } },
            { memberships: { some: { role: "ADMIN", user: { email: { contains: q } } } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { memberships: true } },
      memberships: {
        where: { role: "ADMIN" },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, email: true, name: true, lastLoginAt: true } } },
      },
    },
  });

  return (
    <main className="wrap superadmin">
      <header className="sa-head">
        <Logo />
        <div style={{ flex: 1 }}>
          <h1>Superadmin</h1>
          <small>{me.user.email} · {t.all(orgs.length, !!q)}</small>
        </div>
        {me.acting && (
          <form action={stopActingAs}>
            <button className="btn tiny">{t.stopActing(me.acting.email)}</button>
          </form>
        )}
        <LanguageSwitch />
      </header>

      <form className="sa-search" role="search">
        <input name="q" defaultValue={q} placeholder={t.searchPlaceholder} aria-label={t.searchLabel} />
        <button className="btn tiny primary">{t.search}</button>
        {q && <Link href={withLocale(locale, "/superadmin")} className="inline-link">{t.clear}</Link>}
      </form>

      {orgs.length === 0 && <div className="notice">{t.none}</div>}
      <div className="sa-list">
        {orgs.map((org) => (
          <section key={org.id} className="card panel sa-org">
            <div className="sa-org-head">
              <div>
                <b>{org.name}</b>
                <small>
                  /{org.slug} · {t.members(org._count.memberships)} · {t.created(formatDateTime(org.createdAt, locale))}
                  {org.taskEnabled ? " · Task" : ""}
                  {org.hrEnabled ? " · HR" : ""}
                </small>
              </div>
            </div>
            {org.memberships.length === 0 && <small className="muted">{t.noAdmin}</small>}
            {org.memberships.map(({ user }) => (
              <div key={user.id} className="sa-admin">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="sa-email">{user.email}</span>
                  <small>
                    {user.name ? `${user.name} · ` : ""}
                    {user.lastLoginAt ? t.lastLogin(formatDateTime(user.lastLoginAt, locale)) : t.neverLoggedIn}
                  </small>
                </div>
                <form action={startActingAs}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="slug" value={org.slug} />
                  <button className="btn tiny primary">{user.id === me.user.id ? t.enter : t.actAs}</button>
                </form>
              </div>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
