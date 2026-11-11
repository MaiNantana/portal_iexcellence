import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { startActingAs, stopActingAs } from "@/app/superadmin-actions";
import { Logo } from "@/components/Logo";
import { realUser } from "@/lib/context";
import { db } from "@/lib/db";
import { formatThaiDateTime } from "@/lib/portal";

export const metadata = { title: "Superadmin · iExcellence Portal" };

/** Every company on the Portal, for the platform superadmin: open one as any of its admins (สวมรอย). */
export default async function SuperadminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await realUser();
  if (!me) redirect("/?next=/superadmin");
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
          <small>{me.user.email} · ทุกบริษัทบน Portal ({orgs.length}{q ? " ที่ค้นเจอ" : ""})</small>
        </div>
        {me.acting && (
          <form action={stopActingAs}>
            <button className="btn tiny">เลิกสวมรอย {me.acting.email}</button>
          </form>
        )}
      </header>

      <form className="sa-search" role="search">
        <input name="q" defaultValue={q} placeholder="ค้นชื่อบริษัท รหัส หรืออีเมล Admin" aria-label="ค้นหาบริษัท" />
        <button className="btn tiny primary">ค้นหา</button>
        {q && <Link href="/superadmin" className="inline-link">ล้าง</Link>}
      </form>

      {orgs.length === 0 && <div className="notice">ไม่พบบริษัท</div>}
      <div className="sa-list">
        {orgs.map((org) => (
          <section key={org.id} className="card panel sa-org">
            <div className="sa-org-head">
              <div>
                <b>{org.name}</b>
                <small>
                  /{org.slug} · สมาชิก {org._count.memberships} คน · สร้าง {formatThaiDateTime(org.createdAt)} น.
                  {org.taskEnabled ? " · Task" : ""}
                  {org.hrEnabled ? " · HR" : ""}
                </small>
              </div>
            </div>
            {org.memberships.length === 0 && <small className="muted">ไม่มี Admin</small>}
            {org.memberships.map(({ user }) => (
              <div key={user.id} className="sa-admin">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="sa-email">{user.email}</span>
                  <small>
                    {user.name ? `${user.name} · ` : ""}
                    {user.lastLoginAt ? `เข้าใช้ล่าสุด ${formatThaiDateTime(user.lastLoginAt)} น.` : "ยังไม่เคยเข้าใช้"}
                  </small>
                </div>
                <form action={startActingAs}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="slug" value={org.slug} />
                  <button className="btn tiny primary">{user.id === me.user.id ? "เข้าบริษัท" : "สวมรอย"}</button>
                </form>
              </div>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
