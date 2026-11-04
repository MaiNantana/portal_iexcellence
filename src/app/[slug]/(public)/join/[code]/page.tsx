import Link from "next/link";
import { joinByCode } from "@/app/org-actions";
import { orgPath, requireUser } from "@/lib/context";
import { db } from "@/lib/db";

/** A company join link: /abc/join/<code>. The code must belong to the company in the URL. */
export default async function JoinPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const user = await requireUser(orgPath(slug, `/join/${code}`));
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
        <div className="logo">i</div>
        {!org ? (
          <>
            <h2>ลิงก์นี้ใช้ไม่ได้</h2>
            <p className="muted" style={{ fontSize: 13 }}>ลิงก์อาจหมดอายุหรือถูกปิดแล้ว กรุณาขอลิงก์ใหม่จาก Admin ของบริษัท</p>
          </>
        ) : (
          <>
            <h2>{org.name}</h2>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 18px" }}>
              เข้าร่วมในชื่อ <b>{user.email}</b>
            </p>
            {request ? (
              <div className="notice">ส่งคำขอแล้ว · รอ Admin ของ {org.name} อนุมัติ</div>
            ) : (
              <form action={joinByCode.bind(null, slug, code)}>
                <button className="btn primary" style={{ width: "100%", padding: 12 }}>
                  {member ? "เข้าสู่ Workspace" : org.joinMode === "OPEN" ? "เข้าร่วมบริษัท" : "ส่งคำขอเข้าร่วม"}
                </button>
              </form>
            )}
          </>
        )}
        <p className="login-foot">
          <Link href="/?start=1" className="inline-link">ไปหน้าเริ่มต้น</Link>
        </p>
      </div>
    </main>
  );
}
