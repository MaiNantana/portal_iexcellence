import Link from "next/link";
import { ArrowUpRight, ChevronRight, Settings } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { Suspense } from "react";
import { NewsPanel } from "@/components/NewsPanel";
import { orgPath, requireMember, type Member } from "@/lib/context";
import { CHANNELS, formatThaiDate, getQuickEntries, getVisibleNews, pinnedEntries, toNewsItem } from "@/lib/portal";
import { getHrApprovals, getHrSnapshot, hrDbCaptions } from "@/lib/hr-work";
import { getMyWork, isOverdue, taskDeepLink, workCounts, type MyWork } from "@/lib/task";
import type { HrApproval } from "@/lib/hr";

function todayThai() {
  return new Intl.DateTimeFormat("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date());
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Bangkok" }).format(new Date()));
  if (hour < 12) return "สวัสดีตอนเช้า";
  if (hour < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

export default async function HomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await requireMember(slug);
  const base = orgPath(slug);
  const { org } = member;
  const [{ news, acked }, entries] = await Promise.all([getVisibleNews(member), getQuickEntries(member)]);
  const pinned = pinnedEntries(member, entries);
  const companyLinks = entries.filter((e) => e.kind === "company").length;
  const companyServices = entries.filter((e) => e.kind === "service");

  const services = [
    {
      name: "HR Excellence",
      desc: "ลงเวลา ขอลา และสลิปเงินเดือน",
      icon: "hr",
      style: "orange",
      url: org.hrEnabled && org.hrBaseUrl ? `${base}/go/hr` : null,
    },
    {
      name: "TaskExcellence",
      desc: "งาน แบบฟอร์ม Workflow และการอนุมัติ",
      icon: "task",
      style: "blue",
      url: org.taskEnabled ? `${base}/go/task` : null,
    },
  ];

  return (
    <>
      <div className="intro">
        <span className="eyebrow">{todayThai()}</span>
        <h2>
          {greeting()}
          {member.user.name ? `, ${member.user.name}` : ""}
        </h2>
      </div>

      <section className="quickrail" aria-label="ทางลัดที่ปักหมุด">
        <div className="sec-header">
          <h3>ทางลัด</h3>
          <Link href={`${base}/launcher`} className="inline-link" title="จัดการทางลัด">
            จัดการทางลัด <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <div className="quick-items">
          {pinned.length ? (
            pinned.map((e) => (
              <a key={e.key} className="quickitem" href={e.url} target="_blank" rel="noopener noreferrer" title={e.desc}>
                <span className={`quickicon ${e.kind}`}><AppIcon name={e.icon} size={18} /></span>
                <span className="quicklabel">{e.name}</span>
              </a>
            ))
          ) : (
            <span className="quickempty">ยังไม่ปักหมุดบริการ · เลือกจากทางลัดได้</span>
          )}
        </div>
      </section>

      {(org.taskEnabled || org.hrEnabled) && (
        <Suspense fallback={<WorkDashboard base={base} />}>
          <MyWorkDashboard member={member} base={base} />
        </Suspense>
      )}

      {org.hrEnabled && (
        <Suspense fallback={null}>
          <HrPanel member={member} base={base} />
        </Suspense>
      )}

      <NewsPanel items={news.map((n) => toNewsItem(n, acked))} channels={CHANNELS} base={base} />

      <section className="anchorzone" id="services">
        <div className="sec-header">
          <div>
            <h3>บริการของฉัน</h3>
            <p>เปิดระบบของบริษัทในแท็บใหม่ · ระบบที่ยังไม่ใช้ SSO อาจต้องเข้าสู่ระบบอีกครั้ง</p>
          </div>
          {member.role === "ADMIN" && (
            <Link href={`${base}/admin?tab=connections`} className="btn tiny">
              <Settings size={14} strokeWidth={1.75} aria-hidden="true" /> เชื่อมต่อโปรแกรม
            </Link>
          )}
        </div>
        <div className="servicegrid">
          {services.map((s) => (
            <article key={s.name} className="service card">
              <div className="topline">
                <div className={`serviceicon ${s.style}`}><AppIcon name={s.icon} /></div>
                <span className={`chip ${s.url ? "" : "gray"}`}>{s.url ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อม"}</span>
              </div>
              <div>
                <h4>{s.name}</h4>
                <p>{s.desc}</p>
              </div>
              <div className="servicebottom">
                <span className={`quiet ${s.url ? "svcactive" : ""}`}>
                  {s.url ? "พร้อมใช้" : member.role === "ADMIN" ? "ยังไม่ได้ตั้งค่า" : "ติดต่อ Admin"}
                </span>
                {s.url ? (
                  <a className="btn tiny light" href={s.url} target="_blank" rel="noopener noreferrer">
                    เปิด <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                ) : (
                  member.role === "ADMIN" && (
                    <Link className="btn tiny light" href={`${base}/admin?tab=connections`}>
                      ตั้งค่า <ChevronRight size={14} aria-hidden="true" />
                    </Link>
                  )
                )}
              </div>
            </article>
          ))}
          {companyServices.map((s) => (
            <article key={s.key} className="service card">
              <div className="topline">
                <div className="serviceicon"><AppIcon name={s.icon} /></div>
                <span className="chip">บริการบริษัท</span>
              </div>
              <div>
                <h4>{s.name}</h4>
                <p>{s.desc}</p>
              </div>
              <div className="servicebottom">
                <span className="quiet svcactive">พร้อมใช้</span>
                <a className="btn tiny light" href={s.url} target="_blank" rel="noopener noreferrer">
                  เปิด <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </div>
            </article>
          ))}
          <article className="service card">
            <div className="topline">
              <div className="serviceicon violet"><AppIcon name="apps" /></div>
              <span className="chip">{companyLinks} ลิงก์</span>
            </div>
            <div>
              <h4>Company Apps</h4>
              <p>เว็บไซต์ ERP และระบบภายนอกที่บริษัทเพิ่มไว้</p>
            </div>
            <div className="servicebottom">
              <span className="quiet svcactive">พร้อมใช้</span>
              <Link className="btn tiny light" href={`${base}/launcher`}>
                เปิด <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}

const days = (n: number) => String(Number(n.toFixed(2)));

/** The member's own leave balance and latest payslip period from HR. Amounts stay in HR. */
async function HrPanel({ member, base }: { member: Member; base: string }) {
  const snapshot = await getHrSnapshot(member);
  if (!snapshot) return null;
  if (!snapshot.linked) {
    return (
      <section className="card panel hrpanel" aria-label="ข้อมูล HR ของฉัน">
        <div className="sec-header" style={{ margin: 0 }}>
          <div>
            <h3>ข้อมูล HR ของฉัน</h3>
            <p>เชื่อมบัญชี HR ครั้งเดียว เพื่อดูวันลาคงเหลือและสลิปล่าสุดที่นี่</p>
          </div>
          <Link href={`${base}/hr-link`} className="btn tiny">
            เชื่อมบัญชี HR <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }
  if (!snapshot.accounts.length) return null;
  const captions = snapshot.accounts.length > 1 && member.org.hrBaseUrl ? await hrDbCaptions(member.org.hrBaseUrl) : null;

  return (
    <section className="card panel hrpanel" aria-label="ข้อมูล HR ของฉัน">
      <div className="sec-header">
        <h3>ข้อมูล HR ของฉัน</h3>
      </div>
      {snapshot.accounts.map((a) => (
        <div key={a.db}>
          {captions && <div className="launcher-group">{captions.get(a.db) ?? a.db}</div>}
          <div className="hrstats">
            {a.leave.slice(0, 5).map((l) => (
              <div key={l.name} className="hrstat">
                <span>{l.name}</span>
                <b>{days(Math.max(0, l.quota - l.used))}</b>
                <small>คงเหลือ · ใช้ไป {days(l.used)} จาก {days(l.quota)} วัน</small>
              </div>
            ))}
            {a.lastSlip && (
              <a className="hrstat slip" href={`${base}/go/hr?${new URLSearchParams({ to: "payslip", db: a.db })}`} target="_blank" rel="noopener noreferrer">
                <span>สลิปเงินเดือนล่าสุด</span>
                <strong>
                  {formatThaiDate(new Date(a.lastSlip.start))} – {formatThaiDate(new Date(a.lastSlip.end))}
                </strong>
                <small>
                  เปิดใน HR <ArrowUpRight size={13} aria-hidden="true" />
                </small>
              </a>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

type WorkPreview = { key: string; href: string; title: string; sub: string; when: string | null; late?: boolean };
type WorkPreviews = { overdue: WorkPreview[]; overdueNote: string; approvals: WorkPreview[] };

/** Milliseconds of an API date string, or -Infinity when missing/unparsable (sorts last). */
function timeOf(s: string | null) {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

/** The 3 tasks that went overdue most recently (latest due date first). */
function overduePreview(slug: string, work: MyWork): WorkPreview[] {
  return work.tasks
    .filter((t) => isOverdue(t))
    .sort((a, b) => timeOf(b.dueDate) - timeOf(a.dueDate))
    .slice(0, 3)
    .map((t) => ({
      key: t.taskId,
      href: taskDeepLink(slug, t),
      title: t.title || "(ไม่มีชื่อ)",
      sub: `${t.workspaceName} › ${t.projectName}`,
      when: t.dueDate ? `กำหนด ${formatThaiDate(new Date(t.dueDate))}` : null,
      late: true,
    }));
}

/** The 3 newest approval requests, HR leave/OT and Task workflow together (newest submission first). */
function approvalsPreview(slug: string, work: MyWork | null, hr: HrApproval[] | null): WorkPreview[] {
  const items = [
    ...(hr ?? []).map((a) => ({
      at: a.requestedAt,
      key: `hr:${a.db}:${a.type}:${a.requestId}`,
      href: `${orgPath(slug, "/go/hr")}?${new URLSearchParams({ to: a.type === "AS" ? "approve-leave" : "approve-ot", db: a.db })}`,
      title: `${a.type === "AS" ? "ลางาน" : "OT"} · ${a.employeeName || "-"}`,
      sub: `HR · ${a.kind}`,
    })),
    ...(work?.approvals ?? []).map((a) => ({
      at: a.submittedAt,
      key: `task:${a.taskId}:${a.stepName}`,
      href: taskDeepLink(slug, a),
      title: a.title || "(ไม่มีชื่อ)",
      sub: `Task · ขั้นตอน: ${a.stepName}`,
    })),
  ];
  return items
    .sort((a, b) => timeOf(b.at) - timeOf(a.at))
    .slice(0, 3)
    .map(({ at, ...p }) => ({ ...p, when: timeOf(at) > -Infinity ? `ส่งเมื่อ ${formatThaiDate(new Date(at!))}` : null }));
}

function PreviewList({ title, items, total, href, empty }: { title: string; items: WorkPreview[]; total: number; href: string; empty: string }) {
  return (
    <div className="wpreview">
      <div className="wpreview-head">
        <b>{title}</b>
        <Link href={href} className="inline-link">
          ดูเพิ่มเติม{total > items.length ? ` (${total})` : ""} <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="quiet">{empty}</p>
      ) : (
        items.map((i) => (
          <a key={i.key} className="wprow" href={i.href} target="_blank" rel="noopener noreferrer">
            <span className="wtitle">
              <b>{i.title}</b>
              <small>{i.sub}</small>
            </span>
            {i.when && <span className={`wdue${i.late ? " late" : ""}`}>{i.when}</span>}
          </a>
        ))
      )}
    </div>
  );
}

/**
 * "สิ่งที่ต้องดำเนินการ": counts from Task/HR; each opens My Work on that list, and the latest 3 overdue tasks and
 * approval requests are listed under them. Without counts it's the loading state.
 */
function WorkDashboard({
  base,
  counts,
  previews,
  failed,
}: {
  base: string;
  counts?: { open: number; overdue: number; approvals: number };
  previews?: WorkPreviews;
  failed?: boolean;
}) {
  const items = [
    { tab: "tasks", label: "งานของฉัน", n: counts?.open, warn: false },
    { tab: "overdue", label: "งานเกินกำหนด", n: counts?.overdue, warn: true },
    { tab: "approvals", label: "งานรออนุมัติ", n: counts?.approvals, warn: false },
  ];
  return (
    <section className="card panel" aria-label="สิ่งที่ต้องดำเนินการ" style={{ marginBottom: 16 }}>
      <div className="sec-header">
        <div>
          <h3>สิ่งที่ต้องดำเนินการ</h3>
          <p>{failed ? "ติดต่อ TaskExcellence / HR ไม่ได้ในขณะนี้" : "งานและคำขอที่รอคุณอยู่ · กดเพื่อดูรายการและเปิดงานได้ทันที"}</p>
        </div>
        <Link href={`${base}/my-work`} className="btn tiny">
          ดูทั้งหมด <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="workstats">
        {items.map((i) => (
          <Link key={i.tab} href={`${base}/my-work?tab=${i.tab}`} className={`workstat ${i.warn && i.n ? "warn" : ""}`}>
            <span>
              {i.label}
              <small>{i.tab === "approvals" ? "HR ลา/OT · Task Workflow" : "มอบหมายให้ฉัน"}</small>
            </span>
            <b>{i.n ?? (failed ? "–" : "…")}</b>
          </Link>
        ))}
      </div>
      {previews && counts && (
        <div className="workpreviews">
          <PreviewList title="งานเกินกำหนดล่าสุด" items={previews.overdue} total={counts.overdue} href={`${base}/my-work?tab=overdue`} empty={previews.overdueNote} />
          <PreviewList title="รออนุมัติล่าสุด" items={previews.approvals} total={counts.approvals} href={`${base}/my-work?tab=approvals`} empty="ไม่มีงานรออนุมัติ" />
        </div>
      )}
    </section>
  );
}

async function MyWorkDashboard({ member, base }: { member: Member; base: string }) {
  const [work, hr] = await Promise.all([getMyWork(member), getHrApprovals(member)]);
  if (!work && !hr) return member.org.taskEnabled ? <WorkDashboard base={base} failed /> : null;
  const counts = workCounts(work ?? { tasks: [], approvals: [] });
  counts.approvals += hr?.length ?? 0;
  const slug = member.org.slug;
  const previews: WorkPreviews = {
    overdue: work ? overduePreview(slug, work) : [],
    overdueNote: work ? "ไม่มีงานเกินกำหนด" : "ติดต่อ TaskExcellence ไม่ได้",
    approvals: approvalsPreview(slug, work, hr),
  };
  return <WorkDashboard base={base} counts={counts} previews={previews} />;
}
