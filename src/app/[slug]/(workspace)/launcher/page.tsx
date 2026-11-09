import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { addLink, deleteLink, togglePin, updateLink } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { orgPath, requireMember } from "@/lib/context";
import { getQuickEntries, pinnedEntries, type QuickEntry } from "@/lib/portal";

export default async function LauncherPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug } = await params;
  const base = orgPath(slug);
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
          <button className={`pin-btn ${on ? "pinned" : ""}`} title={on ? "เอาออกจากทางลัด" : "ปักหมุดบนหน้าแรก"} aria-label={`ปักหมุด ${e.name}`}>
            <Star size={17} strokeWidth={1.75} fill={on ? "currentColor" : "none"} aria-hidden="true" />
          </button>
        </form>
        {isAdmin && (e.kind === "hr" || e.kind === "task") && (
          <Link href={`${base}/admin?tab=connections`} className="btn tiny" title="แก้ไข URL ของระบบ (Admin)">
            แก้ไข
          </Link>
        )}
        {canEdit(e) && e.linkId && (
          <>
            <Link href={`${base}/launcher?edit=${e.linkId}`} className="btn tiny" title="แก้ไขชื่อหรือ URL">
              แก้ไข
            </Link>
            <form action={deleteLink.bind(null, slug, e.linkId)}>
              <ConfirmButton className="btn tiny danger" confirmLabel="ลบ" title={e.kind === "company" ? "ลบลิงก์บริษัท (ทุกคนจะไม่เห็น)" : "ลบลิงก์ส่วนตัว"} message={`ลบลิงก์ ${e.name}?${e.kind === "company" ? " พนักงานทุกคนจะไม่เห็นลิงก์นี้อีก" : ""}`}>ลบ</ConfirmButton>
            </form>
          </>
        )}
        <a className="btn tiny light" href={e.url} target="_blank" rel="noopener noreferrer">
          เปิด <ArrowUpRight size={14} aria-hidden="true" />
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
          <h2>ทางลัดของฉัน</h2>
        </div>
      </div>
      <div className="two-col">
        <section className="card panel">
          <div className="notice">
            กดดาวเพื่อปักหมุดบนหน้าแรก · ถ้าระบบปลายทางยังไม่ใช้ SSO อาจต้องเข้าสู่ระบบอีกครั้ง
          </div>
          <div className="launcher-group">ระบบที่เชื่อมต่อ</div>
          {systems.length ? systems.map(row) : <div className="quickempty">ยังไม่มี HR หรือ Task ที่เชื่อมต่อ</div>}
          <div className="launcher-group">ลิงก์บริษัทและลิงก์ส่วนตัว</div>
          {links.length ? links.map(row) : <div className="quickempty">ยังไม่มีลิงก์</div>}
        </section>
        {editing ? (
          <section className="card panel">
            <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>แก้ไขลิงก์</h3>
            <p className="low">{editing.kind === "company" ? "ลิงก์บริษัท · การแก้ไขมีผลกับทุกคน" : "ลิงก์ส่วนตัวของฉัน"}</p>
            <ActionForm key={editing.key} org={slug} action={updateLink} submitLabel="บันทึกการแก้ไข" resetOnSuccess={false} cancelHref={`${base}/launcher`}>
              <input type="hidden" name="id" value={editing.linkId} />
              <div className="field">
                <label htmlFor="name">ชื่อระบบ / บริการ</label>
                <input id="name" name="name" required maxLength={60} defaultValue={editing.name} />
              </div>
              <div className="field">
                <label htmlFor="url">ลิงก์ HTTPS</label>
                <input id="url" name="url" type="url" required pattern="https://.*" defaultValue={editing.url} />
              </div>
            </ActionForm>
          </section>
        ) : (
          <section className="card panel">
            <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>+ เพิ่มลิงก์{isAdmin ? "" : "ส่วนตัว"}</h3>
            <p className="low">การแสดงลิงก์ไม่ได้ให้สิทธิ์ในระบบปลายทาง</p>
            <ActionForm org={slug} action={addLink} submitLabel="เพิ่มลิงก์">
              <div className="field">
                <label htmlFor="name">ชื่อระบบ / บริการ</label>
                <input id="name" name="name" required maxLength={60} placeholder="เช่น ERP, ระบบรับแจ้งซ่อม" />
              </div>
              <div className="field">
                <label htmlFor="url">ลิงก์ HTTPS</label>
                <input id="url" name="url" type="url" required pattern="https://.*" placeholder="https://example.com" />
              </div>
              <div className="field">
                <label htmlFor="visibility">การมองเห็น</label>
                <select id="visibility" name="visibility" defaultValue="PERSONAL">
                  <option value="PERSONAL">ส่วนตัวของฉัน</option>
                  {isAdmin && <option value="COMPANY">ทุกคนในบริษัท (ลิงก์บริษัท)</option>}
                </select>
              </div>
              <label className="checkline">
                <input type="checkbox" name="pin" defaultChecked /> ปักหมุดบนหน้าแรกทันที
              </label>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
