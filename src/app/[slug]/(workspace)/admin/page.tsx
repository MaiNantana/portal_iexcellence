import Link from "next/link";
import { listHrDatabases } from "@/app/hr-actions";
import { HrConnectForm } from "@/components/HrConnectForm";
import { HR_DEFAULT_ORIGIN } from "@/lib/hr";
import { createNews, createService, deleteLink, deleteNews, deleteService, removeMember, revokeInvitation, setMemberDepartment, setMemberRole, setSystemConnected, updateNews, createDepartment, deleteDepartment, renameDepartment } from "@/app/actions";
import {
  addDomain,
  decideJoinRequest,
  regenerateJoinCode,
  updateOrgProfile,
  removeDomain,
  setJoinMode,
  toggleDomainAutoJoin,
  verifyDomain,
} from "@/app/org-actions";
import { ActionForm } from "@/components/ActionForm";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { ConfirmButton } from "@/components/ConfirmButton";
import { InviteMembersForm } from "@/components/InviteMembersForm";
import type { News } from "@prisma/client";
import { MAX_NEWS_FILE_MB, MAX_NEWS_FILES, NEWS_FILE_ACCEPT, formatFileSize } from "@/lib/news-files";
import { orgPath, requireAdmin } from "@/lib/context";
import { db } from "@/lib/db";
import { CHANNELS, SERVICE_ICONS, channelLabel, domainTxtName, formatThaiDate, formatThaiDateTime, getDepartments, toBangkokInput } from "@/lib/portal";
import { getTaskProjects } from "@/lib/task";

const TABS = [
  ["news", "ข่าวสาร"],
  ["services", "บริการ"],
  ["links", "ลิงก์บริษัท"],
  ["connections", "เชื่อมต่อโปรแกรม"],
  ["members", "สมาชิก"],
  ["departments", "แผนก"],
  ["access", "การเข้าร่วม"],
] as const;

export default async function AdminPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const { slug } = await params;
  const admin = await requireAdmin(slug);
  const { tab: rawTab, edit } = await searchParams;
  const tab = TABS.some(([k]) => k === rawTab) ? rawTab! : "news";

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Admin Console</span>
          <h2>จัดการบริษัท · {admin.org.name}</h2>
        </div>
        <span className="chip gray">แพ็กเกจ {admin.org.plan}</span>
      </div>
      <nav className="adminmenu">
        {TABS.map(([k, label]) => (
          <Link key={k} href={orgPath(slug, `/admin?tab=${k}`)} className={tab === k ? "on" : ""}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === "news" && <NewsTab slug={slug} orgId={admin.orgId} editId={edit} />}
      {tab === "services" && <ServicesTab slug={slug} admin={admin} />}
      {tab === "links" && <LinksTab slug={slug} orgId={admin.orgId} />}
      {tab === "connections" && <ConnectionsTab slug={slug} org={admin.org} />}
      {tab === "members" && <MembersTab slug={slug} orgId={admin.orgId} selfId={admin.id} hrEnabled={Boolean(admin.org.hrEnabled && admin.org.hrBaseUrl)} />}
      {tab === "departments" && <DepartmentsTab slug={slug} orgId={admin.orgId} editKey={edit} />}
      {tab === "access" && <AccessTab slug={slug} org={admin.org} />}
    </>
  );
}

const JOIN_MODES = [
  ["OFF", "ปิด", "ไม่มีใครใช้ลิงก์เข้าร่วมได้"],
  ["APPROVAL", "ต้องอนุมัติ", "คนที่กดลิงก์จะส่งคำขอ แล้ว Admin อนุมัติในแท็บสมาชิก"],
  ["OPEN", "เข้าได้ทันที", "ใครมีลิงก์ก็เข้าเป็น Employee ได้เลย เหมาะกับการแชร์ในกลุ่มปิด"],
] as const;

async function AccessTab({ slug, org }: { slug: string; org: { id: string; name: string; joinCode: string | null; joinMode: string } }) {
  const domains = await db.orgDomain.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
  const link = org.joinCode ? `${process.env.AUTH_URL ?? "http://localhost:3000"}${orgPath(slug, `/join/${org.joinCode}`)}` : null;

  return (
    <div className="two-col">
      <section className="card panel">
        <h3>ข้อมูลบริษัท</h3>
        <p className="low">รหัสบริษัทใช้ใน URL ของ Portal เช่น /{slug} · ถ้าเปลี่ยน ลิงก์เดิมที่พนักงาน bookmark ไว้จะใช้ไม่ได้</p>
        <ActionForm org={slug} action={updateOrgProfile} submitLabel="บันทึกข้อมูลบริษัท" resetOnSuccess={false}>
          <div className="field">
            <label htmlFor="org-name">ชื่อบริษัท</label>
            <input id="org-name" name="name" required minLength={2} maxLength={100} defaultValue={org.name} />
          </div>
          <div className="field">
            <label htmlFor="org-slug">รหัสบริษัท (URL)</label>
            <input id="org-slug" name="slug" required pattern="[a-z0-9][a-z0-9_\-]{1,28}[a-z0-9]" defaultValue={slug} />
          </div>
        </ActionForm>
        <div style={{ height: 18 }} />
        <h3>ลิงก์เข้าร่วม</h3>
        <p className="low">แชร์ในกลุ่ม LINE หรืออีเมล เหมาะกับพนักงานที่ใช้อีเมลส่วนตัว</p>
        <form action={setJoinMode.bind(null, slug)}>
          {JOIN_MODES.map(([value, label, desc]) => (
            <label key={value} className="adcard" style={{ cursor: "pointer", justifyContent: "flex-start" }}>
              <input type="radio" name="mode" value={value} defaultChecked={org.joinMode === value} />
              <div>
                <b>{label}</b>
                <small>{desc}</small>
              </div>
            </label>
          ))}
          <div className="form-actions">
            <button className="btn primary">บันทึก</button>
          </div>
        </form>
        {link && org.joinMode !== "OFF" && (
          <>
            <div className="field">
              <label htmlFor="joinlink">ลิงก์ของบริษัท</label>
              <input id="joinlink" readOnly value={link} />
            </div>
            <form action={regenerateJoinCode.bind(null, slug)}>
              <ConfirmButton className="btn tiny danger" title="ลิงก์เดิมจะใช้ไม่ได้ทันที" message="สร้างลิงก์เข้าร่วมใหม่? ลิงก์เดิมที่แชร์ไปแล้วจะใช้ไม่ได้ทันที">สร้างลิงก์ใหม่ (ยกเลิกลิงก์เดิม)</ConfirmButton>
            </form>
          </>
        )}
      </section>

      <section className="card panel">
        <h3>โดเมนอีเมลบริษัท</h3>
        <p className="low">ใครที่เข้าสู่ระบบด้วยอีเมลที่ยืนยันแล้วในโดเมนนี้ จะเข้าบริษัทเป็น Employee อัตโนมัติ · ใช้ gmail.com หรือโดเมนสาธารณะไม่ได้</p>
        <ActionForm org={slug} action={addDomain} submitLabel="เพิ่มโดเมน">
          <div className="field">
            <label htmlFor="domain">โดเมน</label>
            <input id="domain" name="domain" required placeholder="abc.co.th" />
          </div>
        </ActionForm>
        {domains.map((d) => (
          <div className="adcard" key={d.id} style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <b style={{ fontSize: 13 }}>@{d.domain}</b>
              <span className={`chip ${d.verifiedAt ? "" : "warn"}`}>{d.verifiedAt ? "ยืนยันแล้ว" : "รอยืนยัน"}</span>
            </div>
            {d.verifiedAt ? (
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <form action={toggleDomainAutoJoin.bind(null, slug, d.id)}>
                  <button className="btn tiny">{d.autoJoin ? "ปิดการเข้าอัตโนมัติ" : "เปิดการเข้าอัตโนมัติ"}</button>
                </form>
                <span className="low" style={{ alignSelf: "center" }}>{d.autoJoin ? "เข้าอัตโนมัติ: เปิด" : "เข้าอัตโนมัติ: ปิด"}</span>
              </div>
            ) : (
              <>
                <small>เพิ่ม TXT record ที่ผู้ให้บริการ DNS ของโดเมน แล้วกดตรวจสอบ</small>
                <div className="notice" style={{ marginTop: 8, wordBreak: "break-all" }}>
                  ชื่อ (Host): <b>{domainTxtName(d.domain)}</b>
                  <br />
                  ค่า (Value): <b>{d.verifyToken}</b>
                </div>
                <ActionForm org={slug} action={verifyDomain} submitLabel="ตรวจสอบ DNS" resetOnSuccess={false}>
                  <input type="hidden" name="id" value={d.id} />
                </ActionForm>
              </>
            )}
            <form action={removeDomain.bind(null, slug, d.id)} style={{ marginTop: 6 }}>
              <ConfirmButton className="inline-link" style={{ color: "var(--red)" }} confirmLabel="ลบ" message={`ลบโดเมน @${d.domain}? คนที่ใช้อีเมลโดเมนนี้จะไม่เข้าบริษัทอัตโนมัติอีกต่อไป`}>ลบโดเมน</ConfirmButton>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}

type NewsWithFiles = News & { attachments: { id: string; name: string; size: number }[] };

/** Shared by the create and edit forms; `news` fills in the current values when editing. */
function NewsFields({ news, departments, slug }: { news?: NewsWithFiles; departments: Record<string, string>; slug: string }) {
  const scheduled = !news || news.publishedAt > new Date();
  return (
    <>
      <div className="field">
        <label htmlFor="title">หัวข้อข่าว</label>
        <input id="title" name="title" required maxLength={200} defaultValue={news?.title} placeholder="เช่น แจ้งกำหนดการประชุมประจำเดือน" />
      </div>
      <div className="field">
        <label htmlFor="body">เนื้อหา</label>
        <textarea id="body" name="body" required defaultValue={news?.body} />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="channel">Channel</label>
          <select id="channel" name="channel" defaultValue={news?.channel}>
            {Object.entries(CHANNELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="audience">กลุ่มผู้รับ</label>
          <select id="audience" name="audience" defaultValue={news?.audience ?? "all"}>
            <option value="all">พนักงานทั้งหมด</option>
            {Object.entries(departments).map(([k, v]) => (
              <option key={k} value={k}>{v} เท่านั้น</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        {scheduled && (
          <div className="field">
            <label htmlFor="publishAt">ตั้งเวลาเผยแพร่ (เว้นว่าง = ทันที)</label>
            <input id="publishAt" name="publishAt" type="datetime-local" defaultValue={news ? toBangkokInput(news.publishedAt) : ""} />
          </div>
        )}
        <div className="field">
          <label htmlFor="expiresAt">วันหมดอายุ (เว้นว่าง = ไม่หมดอายุ)</label>
          <input id="expiresAt" name="expiresAt" type="datetime-local" defaultValue={toBangkokInput(news?.expiresAt)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="files">แนบไฟล์หรือรูปภาพ (สูงสุด {MAX_NEWS_FILES} ไฟล์ ไฟล์ละไม่เกิน {MAX_NEWS_FILE_MB} MB)</label>
        <input id="files" name="files" type="file" multiple accept={NEWS_FILE_ACCEPT} />
      </div>
      {news?.attachments.map((a) => (
        <label className="checkline" key={a.id}>
          <input type="checkbox" name="removeFile" value={a.id} /> ลบไฟล์{" "}
          <a className="inline-link" href={orgPath(slug, `/news-file/${a.id}`)} target="_blank" rel="noopener noreferrer">{a.name}</a>
          <span className="muted">{formatFileSize(a.size)}</span>
        </label>
      ))}
      <label className="checkline">
        <input type="checkbox" name="requiresAck" defaultChecked={news?.requiresAck} /> ต้องกดรับทราบ
      </label>
      <label className="checkline">
        <input type="checkbox" name="notifyEmail" defaultChecked /> {news && !scheduled ? "แจ้งทางอีเมลว่ามีการแก้ไข (เมื่อแก้เนื้อหาหรือไฟล์)" : "แจ้งผู้รับทางอีเมลเมื่อเผยแพร่"}
      </label>
    </>
  );
}

function NewsStatus({ news, now }: { news: News; now: Date }) {
  if (news.publishedAt > now) return <span className="chip blue">ตั้งเวลา {formatThaiDateTime(news.publishedAt)}</span>;
  if (news.expiresAt && news.expiresAt <= now) return <span className="chip gray">หมดอายุแล้ว</span>;
  return null;
}

function AckPeople({ people, empty }: { people: { key: string; name: string; note?: string }[]; empty: string }) {
  if (!people.length) return <p className="low">{empty}</p>;
  return (
    <ul>
      {people.map((p) => (
        <li key={p.key}>
          {p.name}
          {p.note && <small> · {p.note}</small>}
        </li>
      ))}
    </ul>
  );
}

async function NewsTab({ slug, orgId, editId }: { slug: string; orgId: string; editId?: string }) {
  const [news, members, departments] = await Promise.all([
    db.news.findMany({
      where: { orgId },
      orderBy: { publishedAt: "desc" },
      include: { acks: { select: { userId: true, ackedAt: true } }, attachments: { select: { id: true, name: true, size: true } } },
    }),
    db.membership.findMany({ where: { orgId }, select: { userId: true, department: true, user: { select: { name: true, email: true } } } }),
    getDepartments(orgId),
  ]);
  const editing = news.find((n) => n.id === editId);
  const now = new Date();

  return (
    <div className="two-col">
      {editing ? (
        <section className="card panel">
          <h3>แก้ไขประกาศ</h3>
          {editing.requiresAck && editing.publishedAt <= now && (
            <div className="notice" style={{ marginTop: 12 }}>
              ถ้าแก้หัวข้อ เนื้อหา หรือไฟล์แนบ การรับทราบเดิม{editing.acks.length > 0 && ` ${editing.acks.length} คน`}จะถูกล้าง และทุกคนต้องกดรับทราบอีกครั้ง
            </div>
          )}
          <ActionForm key={editing.id} org={slug} action={updateNews} submitLabel="บันทึกการแก้ไข" resetOnSuccess={false} cancelHref={orgPath(slug, "/admin?tab=news")}>
            <input type="hidden" name="id" value={editing.id} />
            <NewsFields news={editing} departments={departments} slug={slug} />
          </ActionForm>
        </section>
      ) : (
        <section className="card panel">
          <h3>สร้างข่าวสาร</h3>
          <ActionForm org={slug} action={createNews} submitLabel="เผยแพร่">
            <NewsFields departments={departments} slug={slug} />
          </ActionForm>
        </section>
      )}
      <section className="card panel">
        <h3>ข่าวที่เผยแพร่</h3>
        {news.length === 0 && <div className="empty" style={{ marginTop: 12 }}>ยังไม่มีข่าว</div>}
        {news.map((n) => {
          const audience = members.filter((m) => n.audience === "all" || m.department === n.audience);
          const acked = new Map(n.acks.map((a) => [a.userId, a.ackedAt]));
          const person = (m: (typeof audience)[number]) => ({ key: m.userId, name: m.user.name ?? m.user.email, note: m.department ? departments[m.department] : undefined });
          const waiting = audience.filter((m) => !acked.has(m.userId));
          const done = audience.filter((m) => acked.has(m.userId));
          return (
            <div className="adcard stack" key={n.id} style={editing?.id === n.id ? { borderColor: "var(--brand)" } : undefined}>
              <div className="adcard-top">
                <div style={{ minWidth: 0 }}>
                  <b>{n.title}</b> <NewsStatus news={n} now={now} />
                  <small>
                    {channelLabel(n.channel)} · {formatThaiDateTime(n.publishedAt)} · ผู้รับ: {n.audience === "all" ? "ทั้งหมด" : departments[n.audience] ?? n.audience}
                    {n.editedAt && ` · แก้ไข ${formatThaiDateTime(n.editedAt)}`}
                    {n.expiresAt && n.expiresAt > now && ` · หมดอายุ ${formatThaiDateTime(n.expiresAt)}`}
                    {n.attachments.length > 0 && ` · ไฟล์แนบ ${n.attachments.length}`}
                    {n.requiresAck && ` · รับทราบ ${done.length}/${audience.length}`}
                  </small>
                </div>
                <div style={{ display: "flex", gap: 6, flex: "none" }}>
                  <Link href={orgPath(slug, `/admin?tab=news&edit=${n.id}`)} className="btn tiny">แก้ไข</Link>
                  <form action={deleteNews.bind(null, slug, n.id)}>
                    <ConfirmButton className="btn tiny danger" confirmLabel="ลบ" message={`ลบประกาศ "${n.title}"? ประวัติการรับทราบและไฟล์แนบจะหายไปด้วย และกู้คืนไม่ได้`}>ลบ</ConfirmButton>
                  </form>
                </div>
              </div>
              {n.requiresAck && (
                <details className="acklist">
                  <summary>ยังไม่รับทราบ {waiting.length} คน · ดูรายชื่อ</summary>
                  <div className="acklist-cols">
                    <div>
                      <strong>ยังไม่รับทราบ ({waiting.length})</strong>
                      <AckPeople people={waiting.map(person)} empty="รับทราบครบทุกคนแล้ว" />
                    </div>
                    <div>
                      <strong>รับทราบแล้ว ({done.length})</strong>
                      <AckPeople people={done.map((m) => ({ ...person(m), note: formatThaiDateTime(acked.get(m.userId)!) }))} empty="ยังไม่มีใครรับทราบ" />
                    </div>
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

async function DepartmentsTab({ slug, orgId, editKey }: { slug: string; orgId: string; editKey?: string }) {
  const [departments, members, news, services] = await Promise.all([
    db.department.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
    db.membership.groupBy({ by: ["department"], where: { orgId }, _count: true }),
    db.news.groupBy({ by: ["audience"], where: { orgId }, _count: true }),
    db.service.groupBy({ by: ["audience"], where: { orgId }, _count: true }),
  ]);
  const count = (rows: { key: string | null; n: number }[], key: string) => rows.find((r) => r.key === key)?.n ?? 0;
  const memberRows = members.map((m) => ({ key: m.department, n: m._count }));
  const targetRows = [...news, ...services].map((r) => ({ key: r.audience, n: r._count }));
  const editing = departments.find((d) => d.key === editKey);

  return (
    <div className="two-col">
      <section className="card panel">
        <h3>แผนกของบริษัท ({departments.length})</h3>
        <p className="low">ใช้เลือกกลุ่มผู้รับข่าวสารและผู้ใช้บริการ · กำหนดแผนกให้สมาชิกได้ที่แท็บสมาชิก</p>
        {departments.length === 0 && <div className="empty" style={{ marginTop: 12 }}>ยังไม่มีแผนก</div>}
        {departments.map((d) => {
          const people = count(memberRows, d.key);
          const targets = targetRows.filter((r) => r.key === d.key).reduce((sum, r) => sum + r.n, 0);
          return (
            <div className="adcard" key={d.key} style={editing?.key === d.key ? { borderColor: "var(--brand)" } : undefined}>
              <div style={{ minWidth: 0 }}>
                <b>{d.name}</b>
                <small>
                  สมาชิก {people} คน
                  {targets > 0 && ` · ใช้กับข่าวสารหรือบริการ ${targets} รายการ (ลบไม่ได้จนกว่าจะเปลี่ยนกลุ่มผู้รับ)`}
                </small>
              </div>
              <div style={{ display: "flex", gap: 6, flex: "none" }}>
                <Link href={orgPath(slug, `/admin?tab=departments&edit=${d.key}`)} className="btn tiny">แก้ไข</Link>
                {targets === 0 && (
                  <form action={deleteDepartment.bind(null, slug, d.key)}>
                    <ConfirmButton className="btn tiny danger" confirmLabel="ลบ" message={`ลบแผนก ${d.name}?${people ? ` สมาชิก ${people} คนจะกลายเป็น "ไม่ระบุแผนก"` : ""}`}>ลบ</ConfirmButton>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </section>
      <section className="card panel">
        {editing ? (
          <>
            <h3>แก้ไขชื่อแผนก</h3>
            <ActionForm key={editing.key} org={slug} action={renameDepartment} submitLabel="บันทึก" resetOnSuccess={false} cancelHref={orgPath(slug, "/admin?tab=departments")}>
              <input type="hidden" name="key" value={editing.key} />
              <div className="field">
                <label htmlFor="dept-name">ชื่อแผนก</label>
                <input id="dept-name" name="name" required maxLength={60} defaultValue={editing.name} />
              </div>
            </ActionForm>
          </>
        ) : (
          <>
            <h3>เพิ่มแผนก</h3>
            <ActionForm org={slug} action={createDepartment} submitLabel="เพิ่มแผนก">
              <div className="field">
                <label htmlFor="dept-name">ชื่อแผนก</label>
                <input id="dept-name" name="name" required maxLength={60} placeholder="เช่น ฝ่ายบัญชี" />
              </div>
            </ActionForm>
          </>
        )}
      </section>
    </div>
  );
}

async function ServicesTab({ slug, admin }: { slug: string; admin: Awaited<ReturnType<typeof requireAdmin>> }) {
  if (!admin.org.taskEnabled) {
    return (
      <section className="card panel">
        <div className="notice">
          บริการของบริษัท (เช่น แจ้งซ่อม ใบเสนอราคา) ทำงานบน TaskExcellence ·{" "}
          <Link href={orgPath(slug, "/admin?tab=connections")} className="inline-link">เชื่อมต่อ Task ก่อน</Link>
        </div>
      </section>
    );
  }
  const [services, workspaces, departments] = await Promise.all([
    db.service.findMany({ where: { orgId: admin.orgId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    getTaskProjects(admin),
    getDepartments(admin.orgId),
  ]);
  return (
    <div className="two-col">
      <section className="card panel">
        <h3>บริการของบริษัท</h3>
        <p className="low">พนักงานเห็นในเมนูลัด กดแล้วเข้า Project ใน Task ที่ผูกไว้ทันที โดยไม่ต้องค้นหาเอง</p>
        {services.length === 0 && <div className="empty" style={{ marginTop: 12 }}>ยังไม่มีบริการ</div>}
        {services.map((s) => (
          <div className="adcard" key={s.id}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b>
                {SERVICE_ICONS[s.icon]} {s.name}
              </b>{" "}
              <span className="chip gray">{s.audience === "all" ? "ทุกคน" : (departments[s.audience] ?? s.audience)}</span>
              <small>
                Task: {s.taskLabel} · {s.openMode === "form" ? "เปิดฟอร์มแจ้งใหม่" : "เปิดตารางงาน"}
              </small>
            </div>
            <form action={deleteService.bind(null, slug, s.id)}>
              <ConfirmButton className="btn tiny danger" confirmLabel="ลบ" message={`ลบบริการ ${s.name}? งานใน Task จะไม่ถูกลบ แต่พนักงานจะไม่เห็นบริการนี้ใน Portal`}>ลบ</ConfirmButton>
            </form>
          </div>
        ))}
      </section>
      <section className="card panel">
        <h3>เพิ่มบริการ</h3>
        {workspaces === null ? (
          <div className="notice error">ติดต่อ TaskExcellence ไม่ได้ ลองใหม่อีกครั้ง</div>
        ) : workspaces.every((w) => w.projects.length === 0) ? (
          <div className="notice">
            ยังไม่มี Project ใน Task ที่บัญชีคุณ ({admin.user.email}) เห็น · สร้าง Project (เช่นจาก Template แจ้งซ่อม หรือ Accounting) ใน Task ก่อน
          </div>
        ) : (
          <ActionForm org={slug} action={createService} submitLabel="เพิ่มบริการ">
            <div className="field">
              <label htmlFor="svcName">ชื่อบริการ</label>
              <input id="svcName" name="name" required maxLength={60} placeholder="เช่น แจ้งซ่อม" />
            </div>
            <div className="field">
              <label htmlFor="svcDesc">คำอธิบาย</label>
              <input id="svcDesc" name="description" maxLength={120} placeholder="เช่น บริการแจ้งซ่อมบำรุง" />
            </div>
            <div className="field">
              <label htmlFor="svcIcon">ไอคอน</label>
              <select id="svcIcon" name="icon" defaultValue="wrench">
                {Object.entries(SERVICE_ICONS).map(([k, glyph]) => (
                  <option key={k} value={k}>
                    {glyph} {k}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="svcProject">Project ใน TaskExcellence</label>
              <select id="svcProject" name="project" required defaultValue="">
                <option value="" disabled>
                  เลือก Project
                </option>
                {workspaces.map((w) => (
                  <optgroup key={w.id} label={w.name}>
                    {w.projects.map((p) => (
                      <option key={p.id} value={`${w.id}|${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="svcMode">เมื่อกดบริการ</label>
              <select id="svcMode" name="openMode" defaultValue="board">
                <option value="board">เปิดตารางงานของ Project</option>
                <option value="form">เปิดฟอร์มสร้างงานใหม่ (เช่น + แจ้งซ่อมใหม่)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="svcAudience">ใครใช้ได้</label>
              <select id="svcAudience" name="audience" defaultValue="all">
                <option value="all">ทุกคนในบริษัท</option>
                {Object.entries(departments).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <small className="quiet">สิทธิ์ใน Task ยังมีผลเหมือนเดิม · พนักงานต้องเป็นสมาชิก Project นั้นใน Task จึงจะเปิดได้</small>
          </ActionForm>
        )}
      </section>
    </div>
  );
}

async function LinksTab({ slug, orgId }: { slug: string; orgId: string }) {
  const links = await db.appLink.findMany({ where: { orgId, visibility: "COMPANY" }, orderBy: { createdAt: "asc" } });
  return (
    <section className="card panel">
      <div className="notice">
        ลิงก์บริษัทจะแสดงให้พนักงานทุกคน · เพิ่มลิงก์ใหม่ได้จากหน้า <Link href={orgPath(slug, "/launcher")} className="inline-link">ทางลัด</Link> โดยเลือก &ldquo;ทุกคนในบริษัท&rdquo;
      </div>
      {links.length === 0 && <div className="empty" style={{ marginTop: 12 }}>ยังไม่มีลิงก์บริษัท</div>}
      {links.map((l) => (
        <div className="adcard" key={l.id}>
          <div style={{ minWidth: 0 }}>
            <b>{l.name}</b>
            <small>{l.url}</small>
          </div>
          <form action={deleteLink.bind(null, slug, l.id)}>
            <ConfirmButton className="btn tiny danger" confirmLabel="ลบ" message={`ลบลิงก์ ${l.name}? พนักงานทุกคนจะไม่เห็นลิงก์นี้อีก`}>ลบ</ConfirmButton>
          </form>
        </div>
      ))}
    </section>
  );
}

async function ConnectionsTab({
  slug,
  org,
}: {
  slug: string;
  org: { hrEnabled: boolean; hrBaseUrl: string | null; taskEnabled: boolean };
}) {
  const hrUrl = org.hrBaseUrl ?? `${HR_DEFAULT_ORIGIN}/${slug}`;
  const databases = org.hrEnabled ? [] : await listHrDatabases(slug, hrUrl);
  const status = (on: boolean) => <span className={`chip ${on ? "" : "gray"}`}>{on ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อม"}</span>;
  const disconnect = (system: "hr" | "task") => (
    <form action={setSystemConnected.bind(null, slug, system, false)}>
      <ConfirmButton className="btn tiny" message={`ตัดการเชื่อมต่อ ${system === "hr" ? "HR Excellence" : "TaskExcellence"}? พนักงานจะเปิดระบบนี้จาก Portal ไม่ได้จนกว่าจะเชื่อมต่อใหม่`}>ตัดการเชื่อมต่อ</ConfirmButton>
    </form>
  );
  return (
    <section className="card panel" style={{ maxWidth: 720 }}>
      <div className="adcard">
        <div style={{ flex: 1 }}>
          <b>TaskExcellence</b> {status(org.taskEnabled)}
          <small>พนักงานกดจาก Portal แล้วเข้า Task ได้ทันทีโดยไม่ต้อง login ซ้ำ (จับคู่ด้วยอีเมล ถ้ายังไม่มีบัญชี Task จะสร้างให้)</small>
        </div>
        {org.taskEnabled ? (
          disconnect("task")
        ) : (
          <form action={setSystemConnected.bind(null, slug, "task", true)}>
            <button className="btn tiny primary">เชื่อมต่อ</button>
          </form>
        )}
      </div>
      <div className="adcard" style={org.hrEnabled ? undefined : { display: "block" }}>
        <div style={{ flex: 1 }}>
          <b>HR Excellence</b> {status(org.hrEnabled)}
          <small>{org.hrEnabled ? org.hrBaseUrl : "ลงเวลา ขอลา และสลิปเงินเดือน"}</small>
        </div>
        {org.hrEnabled ? (
          disconnect("hr")
        ) : (
          <HrConnectForm slug={slug} defaultUrl={hrUrl} initialDatabases={databases} />
        )}
      </div>
    </section>
  );
}

async function MembersTab({ slug, orgId, selfId, hrEnabled }: { slug: string; orgId: string; selfId: string; hrEnabled: boolean }) {
  const [members, invites, requests, departments] = await Promise.all([
    db.membership.findMany({ where: { orgId }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { orgId, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
    db.joinRequest.findMany({ where: { orgId }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    getDepartments(orgId),
  ]);
  return (
    <div className="two-col">
      <section className="card panel">
        {requests.length > 0 && (
          <>
            <h3>คำขอเข้าร่วม ({requests.length})</h3>
            {requests.map((r) => (
              <div className="adcard" key={r.id} style={{ borderColor: "#f1ddb0", background: "#fffaf1" }}>
                <div style={{ minWidth: 0 }}>
                  <b>{r.user.name ?? r.user.email}</b>
                  <small>{r.user.email} · ขอเมื่อ {formatThaiDate(r.createdAt)}</small>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <form action={decideJoinRequest.bind(null, slug, r.id, true)}>
                    <button className="btn tiny primary">อนุมัติ</button>
                  </form>
                  <form action={decideJoinRequest.bind(null, slug, r.id, false)}>
                    <ConfirmButton className="btn tiny danger" confirmLabel="ปฏิเสธ" message={`ปฏิเสธคำขอเข้าร่วมของ ${r.user.name ?? r.user.email}?`}>ปฏิเสธ</ConfirmButton>
                  </form>
                </div>
              </div>
            ))}
            <div style={{ height: 18 }} />
          </>
        )}
        <h3>สมาชิก ({members.length})</h3>
        <p className="low">บทบาท Admin ใน Portal ไม่ได้ให้สิทธิ์อนุมัติใน HR/Task</p>
        {members.map((m) => (
          <div className="adcard" key={m.id}>
            <div style={{ minWidth: 0 }}>
              <b>
                {m.user.name ?? m.user.email} {m.id === selfId && <span className="chip gray">คุณ</span>}
              </b>
              <small>{m.user.email}</small>
              <small>{m.user.lastLoginAt ? `เข้าใช้ล่าสุด ${formatThaiDateTime(m.user.lastLoginAt)} น.` : "ยังไม่เคยเข้าใช้"}</small>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <form action={setMemberDepartment.bind(null, slug, m.id)}>
                <AutoSubmitSelect name="department" className="orgswitch" aria-label={`แผนกของ ${m.user.name ?? m.user.email}`} defaultValue={m.department ?? ""}>
                  <option value="">ไม่ระบุแผนก</option>
                  {Object.entries(departments).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </AutoSubmitSelect>
              </form>
              <span className={`chip ${m.role === "ADMIN" ? "warn" : "gray"}`}>{m.role === "ADMIN" ? "Admin" : "Employee"}</span>
              <form action={setMemberRole.bind(null, slug, m.id, m.role === "ADMIN" ? "EMPLOYEE" : "ADMIN")}>
                <button className="btn tiny">{m.role === "ADMIN" ? "ลดเป็น Employee" : "ตั้งเป็น Admin"}</button>
              </form>
              {m.id !== selfId && (
                <form action={removeMember.bind(null, slug, m.id)}>
                  <ConfirmButton className="btn tiny danger" confirmLabel="นำออก" message={`นำ ${m.user.name ?? m.user.email} ออกจากบริษัท? คำเชิญและการเชื่อมบัญชี HR/Task ของคนนี้จะถูกลบด้วย`}>นำออก</ConfirmButton>
                </form>
              )}
            </div>
          </div>
        ))}
      </section>
      <section className="card panel">
        <h3>เชิญสมาชิก</h3>
        <p className="low">เชิญได้หลายคนพร้อมกัน ผู้รับเชิญเข้าสู่ระบบด้วย Google / Microsoft ของอีเมลนั้น หรือตั้งรหัสผ่านผ่านรหัสทางอีเมล</p>
        <InviteMembersForm slug={slug} departments={departments} hrEnabled={hrEnabled} />
        {invites.length > 0 && <div className="launcher-group">รอตอบรับ ({invites.length})</div>}
        {invites.map((inv) => (
          <div className="adcard" key={inv.id}>
            <div style={{ minWidth: 0 }}>
              <b>{inv.email}</b>
              <small>
                {inv.role === "ADMIN" ? "Admin" : "Employee"} · เชิญโดย {inv.invitedBy} · {formatThaiDate(inv.createdAt)}
              </small>
            </div>
            <form action={revokeInvitation.bind(null, slug, inv.id)}>
              <ConfirmButton className="btn tiny danger" message={`ยกเลิกคำเชิญของ ${inv.email}?`}>ยกเลิก</ConfirmButton>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
