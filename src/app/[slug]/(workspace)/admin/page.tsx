import Link from "next/link";
import { listHrDatabases } from "@/app/hr-actions";
import { HrConnectForm } from "@/components/HrConnectForm";
import { HR_DEFAULT_ORIGIN } from "@/lib/hr";
import { createNews, createService, deleteLink, deleteNews, deleteService, inviteMember, removeMember, revokeInvitation, setMemberRole, setSystemConnected } from "@/app/actions";
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
import { orgPath, requireAdmin } from "@/lib/context";
import { db } from "@/lib/db";
import { CHANNELS, DEPARTMENTS, SERVICE_ICONS, channelLabel, domainTxtName, formatThaiDate } from "@/lib/portal";
import { getTaskProjects } from "@/lib/task";

const TABS = [
  ["news", "ข่าวสาร"],
  ["services", "บริการ"],
  ["links", "ลิงก์บริษัท"],
  ["connections", "เชื่อมต่อโปรแกรม"],
  ["members", "สมาชิก"],
  ["access", "การเข้าร่วม"],
] as const;

export default async function AdminPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const admin = await requireAdmin(slug);
  const { tab: rawTab } = await searchParams;
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
      {tab === "news" && <NewsTab slug={slug} orgId={admin.orgId} />}
      {tab === "services" && <ServicesTab slug={slug} admin={admin} />}
      {tab === "links" && <LinksTab slug={slug} orgId={admin.orgId} />}
      {tab === "connections" && <ConnectionsTab slug={slug} org={admin.org} />}
      {tab === "members" && <MembersTab slug={slug} orgId={admin.orgId} selfId={admin.id} />}
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
        <h3 style={{ margin: 0, fontSize: 16 }}>ข้อมูลบริษัท</h3>
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
        <h3 style={{ margin: 0, fontSize: 16 }}>ลิงก์เข้าร่วม</h3>
        <p className="low">แชร์ในกลุ่ม LINE หรืออีเมล เหมาะกับพนักงานที่ใช้อีเมลส่วนตัว</p>
        <form action={setJoinMode.bind(null, slug)}>
          {JOIN_MODES.map(([value, label, desc]) => (
            <label key={value} className="adcard" style={{ cursor: "pointer", justifyContent: "flex-start" }}>
              <input type="radio" name="mode" value={value} defaultChecked={org.joinMode === value} />
              <div>
                <b style={{ fontSize: 12 }}>{label}</b>
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
              <button className="btn tiny danger" title="ลิงก์เดิมจะใช้ไม่ได้ทันที">สร้างลิงก์ใหม่ (ยกเลิกลิงก์เดิม)</button>
            </form>
          </>
        )}
      </section>

      <section className="card panel">
        <h3 style={{ margin: 0, fontSize: 16 }}>โดเมนอีเมลบริษัท</h3>
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
              <button className="inline-link" style={{ color: "var(--red)" }}>ลบโดเมน</button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}

async function NewsTab({ slug, orgId }: { slug: string; orgId: string }) {
  const [news, members] = await Promise.all([
    db.news.findMany({ where: { orgId }, orderBy: { publishedAt: "desc" }, include: { _count: { select: { acks: true } } } }),
    db.membership.findMany({ where: { orgId }, select: { department: true } }),
  ]);
  const audienceSize = (audience: string) => (audience === "all" ? members.length : members.filter((m) => m.department === audience).length);

  return (
    <div className="two-col">
      <section className="card panel">
        <h3 style={{ margin: 0, fontSize: 16 }}>สร้างข่าวสาร</h3>
        <ActionForm org={slug} action={createNews} submitLabel="เผยแพร่">
          <div className="field">
            <label htmlFor="title">หัวข้อข่าว</label>
            <input id="title" name="title" required maxLength={200} placeholder="เช่น แจ้งกำหนดการประชุมประจำเดือน" />
          </div>
          <div className="field">
            <label htmlFor="body">เนื้อหา</label>
            <textarea id="body" name="body" required />
          </div>
          <div className="field">
            <label htmlFor="channel">Channel</label>
            <select id="channel" name="channel">
              {Object.entries(CHANNELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="audience">กลุ่มผู้รับ</label>
            <select id="audience" name="audience">
              <option value="all">พนักงานทั้งหมด</option>
              {Object.entries(DEPARTMENTS).map(([k, v]) => (
                <option key={k} value={k}>{v} เท่านั้น</option>
              ))}
            </select>
          </div>
          <label className="checkline">
            <input type="checkbox" name="requiresAck" /> ต้องกดรับทราบ
          </label>
        </ActionForm>
      </section>
      <section className="card panel">
        <h3 style={{ margin: 0, fontSize: 16 }}>ข่าวที่เผยแพร่</h3>
        {news.length === 0 && <div className="empty" style={{ marginTop: 12 }}>ยังไม่มีข่าว</div>}
        {news.map((n) => (
          <div className="adcard" key={n.id}>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 12 }}>{n.title}</b>
              <small>
                {channelLabel(n.channel)} · {formatThaiDate(n.publishedAt)} · ผู้รับ: {n.audience === "all" ? "ทั้งหมด" : DEPARTMENTS[n.audience] ?? n.audience}
                {n.requiresAck && ` · รับทราบ ${n._count.acks}/${audienceSize(n.audience)}`}
              </small>
            </div>
            <form action={deleteNews.bind(null, slug, n.id)}>
              <button className="btn tiny danger">ลบ</button>
            </form>
          </div>
        ))}
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
  const [services, workspaces] = await Promise.all([
    db.service.findMany({ where: { orgId: admin.orgId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    getTaskProjects(admin),
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
              <b style={{ fontSize: 12 }}>
                {SERVICE_ICONS[s.icon]} {s.name}
              </b>{" "}
              <span className="chip gray">{s.audience === "all" ? "ทุกคน" : (DEPARTMENTS[s.audience] ?? s.audience)}</span>
              <small>
                Task: {s.taskLabel} · {s.openMode === "form" ? "เปิดฟอร์มแจ้งใหม่" : "เปิดตารางงาน"}
              </small>
            </div>
            <form action={deleteService.bind(null, slug, s.id)}>
              <button className="btn tiny danger">ลบ</button>
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
                {Object.entries(DEPARTMENTS).map(([k, label]) => (
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
            <b style={{ fontSize: 12 }}>{l.name}</b>
            <small>{l.url}</small>
          </div>
          <form action={deleteLink.bind(null, slug, l.id)}>
            <button className="btn tiny danger">ลบ</button>
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
      <button className="btn tiny">ตัดการเชื่อมต่อ</button>
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

async function MembersTab({ slug, orgId, selfId }: { slug: string; orgId: string; selfId: string }) {
  const [members, invites, requests] = await Promise.all([
    db.membership.findMany({ where: { orgId }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { orgId, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
    db.joinRequest.findMany({ where: { orgId }, include: { user: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <div className="two-col">
      <section className="card panel">
        {requests.length > 0 && (
          <>
            <h3 style={{ margin: 0, fontSize: 16 }}>คำขอเข้าร่วม ({requests.length})</h3>
            {requests.map((r) => (
              <div className="adcard" key={r.id} style={{ borderColor: "#f1ddb0", background: "#fffaf1" }}>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 12 }}>{r.user.name ?? r.user.email}</b>
                  <small>{r.user.email} · ขอเมื่อ {formatThaiDate(r.createdAt)}</small>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <form action={decideJoinRequest.bind(null, slug, r.id, true)}>
                    <button className="btn tiny primary">อนุมัติ</button>
                  </form>
                  <form action={decideJoinRequest.bind(null, slug, r.id, false)}>
                    <button className="btn tiny danger">ปฏิเสธ</button>
                  </form>
                </div>
              </div>
            ))}
            <div style={{ height: 18 }} />
          </>
        )}
        <h3 style={{ margin: 0, fontSize: 16 }}>สมาชิก ({members.length})</h3>
        <p className="low">บทบาท Admin ใน Portal ไม่ได้ให้สิทธิ์อนุมัติใน HR/Task</p>
        {members.map((m) => (
          <div className="adcard" key={m.id}>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 12 }}>
                {m.user.name ?? m.user.email} {m.id === selfId && <span className="chip gray">คุณ</span>}
              </b>
              <small>
                {m.user.email} · {m.department ? DEPARTMENTS[m.department] ?? m.department : "ไม่ระบุแผนก"}
                {m.user.lastLoginAt && ` · เข้าใช้ล่าสุด ${formatThaiDate(m.user.lastLoginAt)}`}
              </small>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span className={`chip ${m.role === "ADMIN" ? "warn" : "gray"}`}>{m.role === "ADMIN" ? "Admin" : "Employee"}</span>
              <form action={setMemberRole.bind(null, slug, m.id, m.role === "ADMIN" ? "EMPLOYEE" : "ADMIN")}>
                <button className="btn tiny">{m.role === "ADMIN" ? "ลดเป็น Employee" : "ตั้งเป็น Admin"}</button>
              </form>
              {m.id !== selfId && (
                <form action={removeMember.bind(null, slug, m.id)}>
                  <button className="btn tiny danger">นำออก</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </section>
      <section className="card panel">
        <h3 style={{ margin: 0, fontSize: 16 }}>เชิญสมาชิก</h3>
        <p className="low">ผู้รับเชิญเข้าสู่ระบบด้วย Google / Microsoft ของอีเมลนี้ หรือตั้งรหัสผ่านผ่านรหัสทางอีเมล</p>
        <ActionForm org={slug} action={inviteMember} submitLabel="ส่งคำเชิญ">
          <div className="field">
            <label htmlFor="inv-email">อีเมล</label>
            <input id="inv-email" name="email" type="email" required placeholder="name@company.com" />
          </div>
          <div className="field">
            <label htmlFor="inv-role">บทบาท</label>
            <select id="inv-role" name="role" defaultValue="EMPLOYEE">
              <option value="EMPLOYEE">Employee</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="inv-dept">แผนก</label>
            <select id="inv-dept" name="department" defaultValue="">
              <option value="">ไม่ระบุ</option>
              {Object.entries(DEPARTMENTS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </ActionForm>
        {invites.length > 0 && <div className="launcher-group">รอตอบรับ ({invites.length})</div>}
        {invites.map((inv) => (
          <div className="adcard" key={inv.id}>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 12 }}>{inv.email}</b>
              <small>
                {inv.role === "ADMIN" ? "Admin" : "Employee"} · เชิญโดย {inv.invitedBy} · {formatThaiDate(inv.createdAt)}
              </small>
            </div>
            <form action={revokeInvitation.bind(null, slug, inv.id)}>
              <button className="btn tiny danger">ยกเลิก</button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
