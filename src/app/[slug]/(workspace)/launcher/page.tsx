import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { addLink, deleteLink, togglePin, updateLink } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { orgPath, requireMember } from "@/lib/context";
import { getQuickEntries, pinnedEntries, type QuickEntry } from "@/lib/portal";
import { defineText, withLocale } from "@/i18n";
import { getLocale } from "@/i18n/server";

const TEXT = defineText({
  th: {
    unpin: "เอาออกจากทางลัด",
    pinHome: "ปักหมุดบนหน้าแรก",
    pinLabel: (name: string) => `ปักหมุด ${name}`,
    editSystem: "แก้ไข URL ของระบบ (Admin)",
    edit: "แก้ไข",
    editLink: "แก้ไขชื่อหรือ URL",
    delete: "ลบ",
    deleteCompanyTitle: "ลบลิงก์บริษัท (ทุกคนจะไม่เห็น)",
    deletePersonalTitle: "ลบลิงก์ส่วนตัว",
    deleteConfirm: (name: string, company: boolean) => `ลบลิงก์ ${name}?${company ? " พนักงานทุกคนจะไม่เห็นลิงก์นี้อีก" : ""}`,
    open: "เปิด",
    title: "ทางลัดของฉัน",
    hint: "กดดาวเพื่อปักหมุดบนหน้าแรก · ถ้าระบบปลายทางยังไม่ใช้ SSO อาจต้องเข้าสู่ระบบอีกครั้ง",
    systems: "ระบบที่เชื่อมต่อ",
    noSystems: "ยังไม่มี HR หรือ Task ที่เชื่อมต่อ",
    linksTitle: "ลิงก์บริษัทและลิงก์ส่วนตัว",
    noLinks: "ยังไม่มีลิงก์",
    editTitle: "แก้ไขลิงก์",
    companyEditNote: "ลิงก์บริษัท · การแก้ไขมีผลกับทุกคน",
    personalNote: "ลิงก์ส่วนตัวของฉัน",
    saveEdit: "บันทึกการแก้ไข",
    name: "ชื่อระบบ / บริการ",
    url: "ลิงก์ HTTPS",
    addTitle: (admin: boolean) => `+ เพิ่มลิงก์${admin ? "" : "ส่วนตัว"}`,
    addNote: "การแสดงลิงก์ไม่ได้ให้สิทธิ์ในระบบปลายทาง",
    add: "เพิ่มลิงก์",
    namePlaceholder: "เช่น ERP, ระบบรับแจ้งซ่อม",
    visibility: "การมองเห็น",
    personal: "ส่วนตัวของฉัน",
    company: "ทุกคนในบริษัท (ลิงก์บริษัท)",
    pinNow: "ปักหมุดบนหน้าแรกทันที",
  },
  en: {
    unpin: "Remove from shortcuts",
    pinHome: "Pin to the home page",
    pinLabel: (name: string) => `Pin ${name}`,
    editSystem: "Edit the system URL (Admin)",
    edit: "Edit",
    editLink: "Edit name or URL",
    delete: "Delete",
    deleteCompanyTitle: "Delete company link (removed for everyone)",
    deletePersonalTitle: "Delete personal link",
    deleteConfirm: (name: string, company: boolean) => `Delete the link ${name}?${company ? " No one in the company will see it any more." : ""}`,
    open: "Open",
    title: "My shortcuts",
    hint: "Star an item to pin it to the home page · systems without SSO may ask you to sign in again",
    systems: "Connected systems",
    noSystems: "No HR or Task connected yet",
    linksTitle: "Company and personal links",
    noLinks: "No links yet",
    editTitle: "Edit link",
    companyEditNote: "Company link · changes apply to everyone",
    personalNote: "My personal link",
    saveEdit: "Save changes",
    name: "System / service name",
    url: "HTTPS link",
    addTitle: (admin: boolean) => `+ Add ${admin ? "a link" : "a personal link"}`,
    addNote: "Showing a link doesn't grant access to that system",
    add: "Add link",
    namePlaceholder: "e.g. ERP, repair requests",
    visibility: "Visible to",
    personal: "Only me",
    company: "Everyone in the company (company link)",
    pinNow: "Pin to the home page now",
  },
});

export default async function LauncherPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = TEXT[locale];
  const base = withLocale(locale, orgPath(slug));
  const member = await requireMember(slug);
  const isAdmin = member.role === "ADMIN";
  const entries = await getQuickEntries(member);
  const pinned = new Set(pinnedEntries(member, entries).map((e) => e.key));
  const canEdit = (e: QuickEntry) => e.kind === "personal" || (e.kind === "company" && isAdmin);

  const { edit } = await searchParams;
  const editing = entries.find((e) => e.linkId && e.linkId === edit && canEdit(e));

  const row = (e: QuickEntry) => {
    const on = pinned.has(e.key);
    return (
      <div className="launcher-row" key={e.key} style={editing?.key === e.key ? { borderColor: "var(--brand)" } : undefined}>
        <div className={`serviceicon ${e.kind === "task" ? "blue" : e.kind === "hr" ? "orange" : ""}`}><AppIcon name={e.icon} /></div>
        <div className="launcher-label">
          <b>{e.name}</b>
          <small>{e.desc}</small>
        </div>
        <form action={togglePin.bind(null, slug, e.key)}>
          <button className={`pin-btn ${on ? "pinned" : ""}`} title={on ? t.unpin : t.pinHome} aria-label={t.pinLabel(e.name)}>
            <Star size={17} strokeWidth={1.75} fill={on ? "currentColor" : "none"} aria-hidden="true" />
          </button>
        </form>
        {isAdmin && (e.kind === "hr" || e.kind === "task") && (
          <Link href={`${base}/admin?tab=connections`} className="btn tiny" title={t.editSystem}>
            {t.edit}
          </Link>
        )}
        {canEdit(e) && e.linkId && (
          <>
            <Link href={`${base}/launcher?edit=${e.linkId}`} className="btn tiny" title={t.editLink}>
              {t.edit}
            </Link>
            <form action={deleteLink.bind(null, slug, e.linkId)}>
              <ConfirmButton className="btn tiny danger" confirmLabel={t.delete} title={e.kind === "company" ? t.deleteCompanyTitle : t.deletePersonalTitle} message={t.deleteConfirm(e.name, e.kind === "company")}>{t.delete}</ConfirmButton>
            </form>
          </>
        )}
        <a className="btn tiny light" href={e.url} target="_blank" rel="noopener noreferrer">
          {t.open} <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    );
  };

  const systems = entries.filter((e) => e.kind === "hr" || e.kind === "task");
  const links = entries.filter((e) => e.kind === "company" || e.kind === "personal");

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Quick Access</span>
          <h2>{t.title}</h2>
        </div>
      </div>
      <div className="two-col">
        <section className="card panel">
          <div className="notice">{t.hint}</div>
          <div className="launcher-group">{t.systems}</div>
          {systems.length ? systems.map(row) : <div className="quickempty">{t.noSystems}</div>}
          <div className="launcher-group">{t.linksTitle}</div>
          {links.length ? links.map(row) : <div className="quickempty">{t.noLinks}</div>}
        </section>
        {editing ? (
          <section className="card panel">
            <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{t.editTitle}</h3>
            <p className="low">{editing.kind === "company" ? t.companyEditNote : t.personalNote}</p>
            <ActionForm key={editing.key} org={slug} action={updateLink} submitLabel={t.saveEdit} resetOnSuccess={false} cancelHref={`${base}/launcher`}>
              <input type="hidden" name="id" value={editing.linkId} />
              <div className="field">
                <label htmlFor="name">{t.name}</label>
                <input id="name" name="name" required maxLength={60} defaultValue={editing.name} />
              </div>
              <div className="field">
                <label htmlFor="url">{t.url}</label>
                <input id="url" name="url" type="url" required pattern="https://.*" defaultValue={editing.url} />
              </div>
            </ActionForm>
          </section>
        ) : (
          <section className="card panel">
            <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{t.addTitle(isAdmin)}</h3>
            <p className="low">{t.addNote}</p>
            <ActionForm org={slug} action={addLink} submitLabel={t.add}>
              <div className="field">
                <label htmlFor="name">{t.name}</label>
                <input id="name" name="name" required maxLength={60} placeholder={t.namePlaceholder} />
              </div>
              <div className="field">
                <label htmlFor="url">{t.url}</label>
                <input id="url" name="url" type="url" required pattern="https://.*" placeholder="https://example.com" />
              </div>
              <div className="field">
                <label htmlFor="visibility">{t.visibility}</label>
                <select id="visibility" name="visibility" defaultValue="PERSONAL">
                  <option value="PERSONAL">{t.personal}</option>
                  {isAdmin && <option value="COMPANY">{t.company}</option>}
                </select>
              </div>
              <label className="checkline">
                <input type="checkbox" name="pin" defaultChecked /> {t.pinNow}
              </label>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
