import Link from "next/link";
import { linkHr, unlinkHr } from "@/app/hr-actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { orgPath, requireMember } from "@/lib/context";
import { HR_TARGETS, hrDatabases, type HrDatabase } from "@/lib/hr";
import { hrLinks } from "@/lib/hr-work";
import { defineText, withLocale } from "@/i18n";
import { getLocale } from "@/i18n/server";

const TEXT = defineText({
  th: {
    back: "‹ กลับหน้าแรก",
    hrOff: "บริษัทยังไม่ได้เชื่อมต่อ HR · ติดต่อ Admin",
    link: "เชื่อมบัญชี HR",
    database: "ฐานข้อมูล",
    pickDatabase: "เลือกฐานข้อมูล",
    hrUser: "ชื่อผู้ใช้ HR",
    hrPassword: "รหัสผ่าน HR",
    pickTitle: "เลือกฐานข้อมูล HR ที่จะเปิด",
    linkedTitle: "เชื่อมบัญชี HR แล้ว",
    linkedTo: (email: string) => `${email} เชื่อมกับบัญชี HR เหล่านี้`,
    hrUserIs: (u: string) => `ผู้ใช้ HR ${u}`,
    unlinkConfirm: (db: string) => `ยกเลิกการเชื่อมบัญชี HR ของ ${db}? ต้องยืนยันรหัสผ่าน HR ใหม่ถ้าจะเชื่อมอีกครั้ง`,
    unlink: "ยกเลิกการเชื่อม",
    openHr: "เปิด HR ↗",
    addTitle: "เชื่อมฐานข้อมูลอื่นเพิ่ม",
    addLead: "ถ้าคุณมีบัญชี HR ในฐานข้อมูลอื่นของบริษัทด้วย เชื่อมเพิ่มได้ รายการรออนุมัติจะรวมทุกฐาน",
    firstTitle: "เชื่อมบัญชี HR Excellence",
    firstLead: "ยืนยันบัญชี HR ของคุณครั้งแรกครั้งเดียว ครั้งต่อไปกดจาก Portal แล้วเข้า HR ได้ทันที · Portal ไม่เก็บรหัสผ่าน HR",
    unreachable: "ติดต่อระบบ HR ไม่ได้ ลองใหม่อีกครั้ง",
  },
  en: {
    back: "‹ Back to home",
    hrOff: "Your company hasn't connected HR yet · ask your Admin",
    link: "Link HR account",
    database: "Database",
    pickDatabase: "Choose a database",
    hrUser: "HR username",
    hrPassword: "HR password",
    pickTitle: "Choose the HR database to open",
    linkedTitle: "HR account linked",
    linkedTo: (email: string) => `${email} is linked to these HR accounts`,
    hrUserIs: (u: string) => `HR user ${u}`,
    unlinkConfirm: (db: string) => `Unlink the HR account for ${db}? You'll need your HR password to link it again.`,
    unlink: "Unlink",
    openHr: "Open HR ↗",
    addTitle: "Link another database",
    addLead: "If you also have an HR account in another of the company's databases, link it too. Approval lists combine all of them.",
    firstTitle: "Link your HR Excellence account",
    firstLead: "Confirm your HR account once. After that, open HR straight from the Portal · the Portal does not store your HR password",
    unreachable: "Can't reach HR. Please try again.",
  },
});

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
  const locale = await getLocale();
  const t = TEXT[locale];
  const base = withLocale(locale, orgPath(slug));
  const { org } = member;
  const back = (
    <Link href={base} className="inline-link">
      {t.back}
    </Link>
  );

  if (!org.hrEnabled || !org.hrBaseUrl) {
    return (
      <article className="card panel article">
        {back}
        <h1>HR Excellence</h1>
        <div className="notice">{t.hrOff}</div>
      </article>
    );
  }

  let databases: HrDatabase[] = [];
  let apiError = false;
  try {
    databases = await hrDatabases(org.hrBaseUrl);
  } catch (err) {
    console.error("[hr-link] HR API failed:", err);
    apiError = true;
  }
  const links = await hrLinks(member);
  const caption = (name: string) => databases.find((d) => d.name === name)?.caption ?? name;
  const unlinked = databases.filter((d) => !links.some((l) => l.externalDb === d.name));
  const open = (externalDb: string) => `${base}/go/hr?${new URLSearchParams({ db: externalDb, ...(to && HR_TARGETS.has(to) ? { to } : {}) })}`;

  const form = (
    <ActionForm org={slug} action={linkHr} submitLabel={t.link}>
      {databases.length > 1 && (
        <div className="field">
          <label htmlFor="hrDb">{t.database}</label>
          <select id="hrDb" name="hrDb" required defaultValue={unlinked.length === 1 ? unlinked[0].name : ""}>
            <option value="" disabled>
              {t.pickDatabase}
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
        <label htmlFor="hrUser">{t.hrUser}</label>
        <input id="hrUser" name="hrUser" required autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="hrPassword">{t.hrPassword}</label>
        <input id="hrPassword" name="hrPassword" type="password" required autoComplete="off" />
      </div>
    </ActionForm>
  );

  if (links.length) {
    return (
      <article className="card panel article" style={{ maxWidth: 560 }}>
        {back}
        <h1>{links.length > 1 ? t.pickTitle : t.linkedTitle}</h1>
        <p className="body">{t.linkedTo(member.user.email)}</p>
        {links.map((l) => (
          <div key={l.id} className="workrow">
            <span className="quickicon hr">HR</span>
            <span className="wtitle">
              <b>{caption(l.externalDb)}</b>
              <small>{t.hrUserIs(l.externalUserId.split("|")[0])}</small>
            </span>
            <form action={unlinkHr.bind(null, slug, l.externalDb)}>
              <ConfirmButton className="btn tiny" message={t.unlinkConfirm(caption(l.externalDb))}>{t.unlink}</ConfirmButton>
            </form>
            <a className="btn tiny primary" href={open(l.externalDb)} target="_blank" rel="noopener noreferrer">
              {t.openHr}
            </a>
          </div>
        ))}
        {!apiError && unlinked.length > 0 && (
          <>
            <h2 style={{ marginTop: 24 }}>{t.addTitle}</h2>
            <p className="body">{t.addLead}</p>
            {form}
          </>
        )}
      </article>
    );
  }

  return (
    <article className="card panel article" style={{ maxWidth: 560 }}>
      {back}
      <h1>{t.firstTitle}</h1>
      <p className="body">{t.firstLead}</p>
      {apiError ? <div className="notice error">{t.unreachable}</div> : form}
    </article>
  );
}
