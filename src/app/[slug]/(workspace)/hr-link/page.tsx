import Link from "next/link";
import { linkHr, unlinkHr } from "@/app/hr-actions";
import { ActionForm } from "@/components/ActionForm";
import { orgPath, requireMember } from "@/lib/context";
import { HR_TARGETS, hrCustomer, hrDatabases, type HrDatabase } from "@/lib/hr";
import { hrLinks } from "@/lib/hr-work";

/**
 * First visit to HR from the Portal: confirm the HR account once with its HR password.
 * One HR URL can hold several databases; the member links each one they work in and picks one here
 * when opening HR (?to= carries the HR page they were heading to).
 */
export default async function HrLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ to?: string }>;
}) {
  const { slug } = await params;
  const { to } = await searchParams;
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

  let databases: HrDatabase[] = [];
  let apiError = false;
  try {
    databases = await hrDatabases(hrCustomer(org.hrBaseUrl));
  } catch (err) {
    console.error("[hr-link] HR API failed:", err);
    apiError = true;
  }
  const links = await hrLinks(member);
  const caption = (name: string) => databases.find((d) => d.name === name)?.caption ?? name;
  const unlinked = databases.filter((d) => !links.some((l) => l.externalDb === d.name));
  const open = (externalDb: string) =>
    `${orgPath(slug, "/go/hr")}?${new URLSearchParams({ db: externalDb, ...(to && HR_TARGETS.has(to) ? { to } : {}) })}`;

  const form = (
    <ActionForm org={slug} action={linkHr} submitLabel="เชื่อมบัญชี HR">
      {databases.length > 1 && (
        <div className="field">
          <label htmlFor="hrDb">ฐานข้อมูล</label>
          <select id="hrDb" name="hrDb" required defaultValue={unlinked.length === 1 ? unlinked[0].name : ""}>
            <option value="" disabled>
              เลือกฐานข้อมูล
            </option>
            {unlinked.map((d) => (
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
  );

  if (links.length) {
    return (
      <article className="card panel article" style={{ maxWidth: 560 }}>
        {back}
        <h1>{links.length > 1 ? "เลือกฐานข้อมูล HR ที่จะเปิด" : "เชื่อมบัญชี HR แล้ว"}</h1>
        <p className="body">{member.user.email} เชื่อมกับบัญชี HR เหล่านี้</p>
        {links.map((l) => (
          <div key={l.id} className="workrow">
            <span className="quickicon hr">HR</span>
            <span className="wtitle">
              <b>{caption(l.externalDb)}</b>
              <small>ผู้ใช้ HR {l.externalUserId.split("|")[0]}</small>
            </span>
            <form action={unlinkHr.bind(null, slug, l.externalDb)}>
              <button className="btn tiny">ยกเลิกการเชื่อม</button>
            </form>
            <a className="btn tiny primary" href={open(l.externalDb)} target="_blank" rel="noopener noreferrer">
              เปิด HR ↗
            </a>
          </div>
        ))}
        {!apiError && unlinked.length > 0 && (
          <>
            <h2 style={{ marginTop: 24 }}>เชื่อมฐานข้อมูลอื่นเพิ่ม</h2>
            <p className="body">ถ้าคุณมีบัญชี HR ในฐานข้อมูลอื่นของบริษัทด้วย เชื่อมเพิ่มได้ รายการรออนุมัติจะรวมทุกฐาน</p>
            {form}
          </>
        )}
      </article>
    );
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
        form
      )}
    </article>
  );
}
