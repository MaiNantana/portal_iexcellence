import Link from "next/link";
import { logout, switchOrg } from "@/app/actions";
import { MobileDock, TopNav } from "@/components/NavLinks";
import { orgPath, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { getVisibleNews } from "@/lib/portal";

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await requireMember(slug);
  const [{ pending }, orgs] = await Promise.all([
    getVisibleNews(member),
    db.membership.findMany({ where: { userId: member.userId }, select: { org: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const isAdmin = member.role === "ADMIN";
  const base = orgPath(slug);

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <Link href={base} className="brand">
            <div className="logo">i</div>
            <div>
              <h1>{member.org.name}</h1>
              <div className="subbrand">COMPANY WORKSPACE</div>
            </div>
          </Link>
          <TopNav base={base} />
          <div className="righttools">
            <Link
              href={pending[0] ? `${base}/news/${pending[0].id}` : `${base}#news`}
              className="iconbtn"
              title={pending.length ? `${pending.length} ประกาศที่ยังไม่รับทราบ` : "ไม่มีประกาศที่ต้องรับทราบ"}
            >
              ♧{pending.length > 0 && <span className="dot" />}
            </Link>
            {isAdmin && (
              <Link href={`${base}/admin`} className="iconbtn" title="จัดการบริษัท">
                ⚙
              </Link>
            )}
            {orgs.length > 1 && (
              <form action={switchOrg} style={{ display: "flex", gap: 4 }}>
                <select name="orgId" defaultValue={member.orgId} className="orgswitch" aria-label="เลือกบริษัท">
                  {orgs.map(({ org }) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
                <button className="iconbtn" title="สลับบริษัท">⇄</button>
              </form>
            )}
            <div className="userchip">
              <b>{member.user.name ?? member.user.email}</b>
              <small>{isAdmin ? "Admin" : "Employee"}</small>
            </div>
            <form action={logout.bind(null, slug)}>
              <button className="iconbtn" title="ออกจากระบบ" aria-label="ออกจากระบบ">⎋</button>
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
            {member.user.email} · <Link href="/?start=1" className="inline-link">สร้าง / เข้าร่วมบริษัทอื่น</Link>
          </span>
        </footer>
      </main>
    </>
  );
}
