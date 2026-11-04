import Link from "next/link";
import { linkHr, unlinkHr } from "@/app/hr-actions";
import { ActionForm } from "@/components/ActionForm";
import { orgPath, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { hrCustomer, hrDatabases, type HrDatabase } from "@/lib/hr";

/** First visit to HR from the Portal: confirm the HR account once with its HR password. */
export default async function HrLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await requireMember(slug);
  const { org } = member;
  const back = (
    <Link href={orgPath(slug)} className="inline-link">
      ‹ กลับหน้าแรก
    </Link>
  );

  if (!org.hrEnabled || !org.hrBaseUrl) {
    return (
      <article className="card panel article">
        {back}
        <h1>HR Excellence</h1>
        <div className="notice">บริษัทยังไม่ได้เชื่อมต่อ HR · ติดต่อ Admin</div>
      </article>
    );
  }

  const link = await db.accountLink.findUnique({
    where: { orgId_userId_system: { orgId: org.id, userId: member.userId, system: "HR" } },
  });

  if (link) {
    return (
      <article className="card panel article" style={{ maxWidth: 560 }}>
        {back}
        <h1>เชื่อมบัญชี HR แล้ว</h1>
        <p className="body">
          {member.user.email} ↔ HR <b>{link.externalUserId.split("|")[0]}</b>
        </p>
        <div className="form-actions" style={{ gap: 8 }}>
          <form action={unlinkHr.bind(null, slug)}>
            <button className="btn">ยกเลิกการเชื่อม</button>
          </form>
          <a className="btn primary" href={orgPath(slug, "/go/hr")} target="_blank" rel="noopener noreferrer">
            เปิด HR ↗
          </a>
        </div>
      </article>
    );
  }

  let databases: HrDatabase[] = [];
  let apiError = false;
  try {
    databases = await hrDatabases(hrCustomer(org.hrBaseUrl));
  } catch (err) {
    console.error("[hr-link] HR API failed:", err);
    apiError = true;
  }

  return (
    <article className="card panel article" style={{ maxWidth: 560 }}>
      {back}
      <h1>เชื่อมบัญชี HR Excellence</h1>
      <p className="body">
        ยืนยันบัญชี HR ของคุณครั้งแรกครั้งเดียว ครั้งต่อไปกดจาก Portal แล้วเข้า HR ได้ทันที · Portal ไม่เก็บรหัสผ่าน HR
      </p>
      {apiError ? (
        <div className="notice error">ติดต่อระบบ HR ไม่ได้ ลองใหม่อีกครั้ง</div>
      ) : (
        <ActionForm org={slug} action={linkHr} submitLabel="เชื่อมบัญชี HR">
          {databases.length > 1 && (
            <div className="field">
              <label htmlFor="hrDb">ฐานข้อมูล</label>
              <select id="hrDb" name="hrDb" required defaultValue="">
                <option value="" disabled>
                  เลือกฐานข้อมูล
                </option>
                {databases.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.caption}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="hrUser">ชื่อผู้ใช้ HR</label>
            <input id="hrUser" name="hrUser" required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="hrPassword">รหัสผ่าน HR</label>
            <input id="hrPassword" name="hrPassword" type="password" required autoComplete="off" />
          </div>
        </ActionForm>
      )}
    </article>
  );
}
