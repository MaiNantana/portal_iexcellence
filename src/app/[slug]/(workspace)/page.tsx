import Link from "next/link";
import { ArrowUpRight, ChevronRight, Settings } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { Suspense } from "react";
import { NewsPanel } from "@/components/NewsPanel";
import { orgPath, requireMember, type Member } from "@/lib/context";
import { channelNames, formatDue, getQuickEntries, parseApiDate, getVisibleNews, pinnedEntries, toNewsItem } from "@/lib/portal";
import { getHrApprovals, getHrSnapshot, hrDbCaptions } from "@/lib/hr-work";
import { getMyWork, isOverdue, taskDeepLink, workCounts, type MyWork } from "@/lib/task";
import type { HrApproval } from "@/lib/hr";
import { defineText, formatDate, formatDateTime, withLocale, type Locale } from "@/i18n";
import { getLocale } from "@/i18n/server";

const TEXT = defineText({
  th: {
    morning: "สวัสดีตอนเช้า",
    afternoon: "สวัสดีตอนบ่าย",
    evening: "สวัสดีตอนเย็น",
    pinnedLabel: "ทางลัดที่ปักหมุด",
    shortcuts: "ทางลัด",
    manageShortcuts: "จัดการทางลัด",
    noPins: "ยังไม่ปักหมุดบริการ · เลือกจากทางลัดได้",
    hrDesc: "ลงเวลา ขอลา และสลิปเงินเดือน",
    taskDesc: "งาน แบบฟอร์ม Workflow และการอนุมัติ",
    myServices: "บริการของฉัน",
    servicesLead: "เปิดระบบของบริษัทในแท็บใหม่ · ระบบที่ยังไม่ใช้ SSO อาจต้องเข้าสู่ระบบอีกครั้ง",
    connectApps: "เชื่อมต่อโปรแกรม",
    connected: "เชื่อมต่อแล้ว",
    notConnected: "ยังไม่เชื่อม",
    ready: "พร้อมใช้",
    notSetUp: "ยังไม่ได้ตั้งค่า",
    askAdmin: "ติดต่อ Admin",
    open: "เปิด",
    setUp: "ตั้งค่า",
    companyService: "บริการบริษัท",
    links: (n: number) => `${n} ลิงก์`,
    appsDesc: "เว็บไซต์ ERP และระบบภายนอกที่บริษัทเพิ่มไว้",
    myHr: "ข้อมูล HR ของฉัน",
    hrLinkLead: "เชื่อมบัญชี HR ครั้งเดียว เพื่อดูวันลาคงเหลือและสลิปล่าสุดที่นี่",
    linkHr: "เชื่อมบัญชี HR",
    leaveLeft: (used: string, quota: string) => `คงเหลือ · ใช้ไป ${used} จาก ${quota} วัน`,
    lastSlip: "สลิปเงินเดือนล่าสุด",
    openInHr: "เปิดใน HR",
    untitled: "(ไม่มีชื่อ)",
    due: (d: string) => `กำหนด ${d}`,
    leave: "ลางาน",
    step: (s: string) => `Task · ขั้นตอน: ${s}`,
    sent: (d: string) => `ส่งเมื่อ ${d}`,
    more: "ดูเพิ่มเติม",
    myTasks: "งานของฉัน",
    overdue: "งานเกินกำหนด",
    approvals: "งานรออนุมัติ",
    todo: "สิ่งที่ต้องดำเนินการ",
    unreachable: "ติดต่อ TaskExcellence / HR ไม่ได้ในขณะนี้",
    todoLead: "งานและคำขอที่รอคุณอยู่ · กดเพื่อดูรายการและเปิดงานได้ทันที",
    seeAll: "ดูทั้งหมด",
    approvalSources: "HR ลา/OT · Task Workflow",
    assignedToMe: "มอบหมายให้ฉัน",
    latestOverdue: "งานเกินกำหนดล่าสุด",
    latestApprovals: "รออนุมัติล่าสุด",
    noApprovals: "ไม่มีงานรออนุมัติ",
    noOverdue: "ไม่มีงานเกินกำหนด",
    taskUnreachable: "ติดต่อ TaskExcellence ไม่ได้",
  },
  en: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    pinnedLabel: "Pinned shortcuts",
    shortcuts: "Shortcuts",
    manageShortcuts: "Manage shortcuts",
    noPins: "Nothing pinned yet · pick from Shortcuts",
    hrDesc: "Time attendance, leave requests and payslips",
    taskDesc: "Tasks, forms, workflows and approvals",
    myServices: "My services",
    servicesLead: "Opens company systems in a new tab · systems without SSO may ask you to sign in again",
    connectApps: "Connect apps",
    connected: "Connected",
    notConnected: "Not connected",
    ready: "Ready",
    notSetUp: "Not set up",
    askAdmin: "Ask your Admin",
    open: "Open",
    setUp: "Set up",
    companyService: "Company service",
    links: (n: number) => `${n} link${n === 1 ? "" : "s"}`,
    appsDesc: "Websites, ERP and other systems your company added",
    myHr: "My HR",
    hrLinkLead: "Link your HR account once to see your leave balance and latest payslip here",
    linkHr: "Link HR account",
    leaveLeft: (used: string, quota: string) => `left · used ${used} of ${quota} days`,
    lastSlip: "Latest payslip",
    openInHr: "Open in HR",
    untitled: "(untitled)",
    due: (d: string) => `Due ${d}`,
    leave: "Leave",
    step: (s: string) => `Task · step: ${s}`,
    sent: (d: string) => `Sent ${d}`,
    more: "See more",
    myTasks: "My tasks",
    overdue: "Overdue",
    approvals: "Waiting for approval",
    todo: "To do",
    unreachable: "Can't reach TaskExcellence / HR right now",
    todoLead: "Work and requests waiting for you · open a list to act on them",
    seeAll: "See all",
    approvalSources: "HR leave/OT · Task workflow",
    assignedToMe: "Assigned to me",
    latestOverdue: "Latest overdue",
    latestApprovals: "Latest approvals",
    noApprovals: "Nothing waiting for approval",
    noOverdue: "Nothing overdue",
    taskUnreachable: "Can't reach TaskExcellence",
  },
});

type T = (typeof TEXT)["th"];

function today(locale: Locale) {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date());
}

function greeting(t: T) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Bangkok" }).format(new Date()));
  if (hour < 12) return t.morning;
  if (hour < 17) return t.afternoon;
  return t.evening;
}

export default async function HomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await requireMember(slug);
  const locale = await getLocale();
  const t = TEXT[locale];
  const base = withLocale(locale, orgPath(slug));
  const { org } = member;
  const [{ news, acked }, entries] = await Promise.all([getVisibleNews(member), getQuickEntries(member)]);
  const pinned = pinnedEntries(member, entries);
  const companyLinks = entries.filter((e) => e.kind === "company").length;
  const companyServices = entries.filter((e) => e.kind === "service");

  const services = [
    {
      name: "HR Excellence",
      desc: t.hrDesc,
      icon: "hr",
      style: "orange",
      url: org.hrEnabled && org.hrBaseUrl ? `${base}/go/hr` : null,
    },
    {
      name: "TaskExcellence",
      desc: t.taskDesc,
      icon: "task",
      style: "blue",
      url: org.taskEnabled ? `${base}/go/task` : null,
    },
  ];

  return (
    <>
      <div className="intro">
        <span className="eyebrow">{today(locale)}</span>
        <h2>
          {greeting(t)}
          {member.user.name ? `, ${member.user.name}` : ""}
        </h2>
      </div>

      <section className="quickrail" aria-label={t.pinnedLabel}>
        <div className="sec-header">
          <h3>{t.shortcuts}</h3>
          <Link href={`${base}/launcher`} className="inline-link" title={t.manageShortcuts}>
            {t.manageShortcuts} <ChevronRight size={14} aria-hidden="true" />
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
            <span className="quickempty">{t.noPins}</span>
          )}
        </div>
      </section>

      {(org.taskEnabled || org.hrEnabled) && (
        <Suspense fallback={<WorkDashboard base={base} t={t} />}>
          <MyWorkDashboard member={member} base={base} locale={locale} />
        </Suspense>
      )}

      {org.hrEnabled && (
        <Suspense fallback={null}>
          <HrPanel member={member} base={base} locale={locale} />
        </Suspense>
      )}

      <NewsPanel items={news.map((n) => toNewsItem(n, acked, locale))} channels={channelNames(locale)} base={base} />

      <section className="anchorzone" id="services">
        <div className="sec-header">
          <div>
            <h3>{t.myServices}</h3>
            <p>{t.servicesLead}</p>
          </div>
          {member.role === "ADMIN" && (
            <Link href={`${base}/admin?tab=connections`} className="btn tiny">
              <Settings size={14} strokeWidth={1.75} aria-hidden="true" /> {t.connectApps}
            </Link>
          )}
        </div>
        <div className="servicegrid">
          {services.map((s) => (
            <article key={s.name} className="service card">
              <div className="topline">
                <div className={`serviceicon ${s.style}`}><AppIcon name={s.icon} /></div>
                <span className={`chip ${s.url ? "" : "gray"}`}>{s.url ? t.connected : t.notConnected}</span>
              </div>
              <div>
                <h4>{s.name}</h4>
                <p>{s.desc}</p>
              </div>
              <div className="servicebottom">
                <span className={`quiet ${s.url ? "svcactive" : ""}`}>
                  {s.url ? t.ready : member.role === "ADMIN" ? t.notSetUp : t.askAdmin}
                </span>
                {s.url ? (
                  <a className="btn tiny light" href={s.url} target="_blank" rel="noopener noreferrer">
                    {t.open} <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                ) : (
                  member.role === "ADMIN" && (
                    <Link className="btn tiny light" href={`${base}/admin?tab=connections`}>
                      {t.setUp} <ChevronRight size={14} aria-hidden="true" />
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
                <span className="chip">{t.companyService}</span>
              </div>
              <div>
                <h4>{s.name}</h4>
                <p>{s.desc}</p>
              </div>
              <div className="servicebottom">
                <span className="quiet svcactive">{t.ready}</span>
                <a className="btn tiny light" href={s.url} target="_blank" rel="noopener noreferrer">
                  {t.open} <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </div>
            </article>
          ))}
          <article className="service card">
            <div className="topline">
              <div className="serviceicon violet"><AppIcon name="apps" /></div>
              <span className="chip">{t.links(companyLinks)}</span>
            </div>
            <div>
              <h4>Company Apps</h4>
              <p>{t.appsDesc}</p>
            </div>
            <div className="servicebottom">
              <span className="quiet svcactive">{t.ready}</span>
              <Link className="btn tiny light" href={`${base}/launcher`}>
                {t.open} <ArrowUpRight size={14} aria-hidden="true" />
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
async function HrPanel({ member, base, locale }: { member: Member; base: string; locale: Locale }) {
  const t = TEXT[locale];
  const snapshot = await getHrSnapshot(member);
  if (!snapshot) return null;
  if (!snapshot.linked) {
    return (
      <section className="card panel hrpanel" aria-label={t.myHr}>
        <div className="sec-header" style={{ margin: 0 }}>
          <div>
            <h3>{t.myHr}</h3>
            <p>{t.hrLinkLead}</p>
          </div>
          <Link href={`${base}/hr-link`} className="btn tiny">
            {t.linkHr} <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }
  if (!snapshot.accounts.length) return null;
  const captions = snapshot.accounts.length > 1 && member.org.hrBaseUrl ? await hrDbCaptions(member.org.hrBaseUrl) : null;

  return (
    <section className="card panel hrpanel" aria-label={t.myHr}>
      <div className="sec-header">
        <h3>{t.myHr}</h3>
      </div>
      {snapshot.accounts.map((a) => (
        <div key={a.db}>
          {captions && <div className="launcher-group">{captions.get(a.db) ?? a.db}</div>}
          <div className="hrstats">
            {a.leave.slice(0, 5).map((l) => (
              <div key={l.name} className="hrstat">
                <span>{l.name}</span>
                <b>{days(Math.max(0, l.quota - l.used))}</b>
                <small>{t.leaveLeft(days(l.used), days(l.quota))}</small>
              </div>
            ))}
            {a.lastSlip && (
              <a className="hrstat slip" href={`${base}/go/hr?${new URLSearchParams({ to: "payslip", db: a.db })}`} target="_blank" rel="noopener noreferrer">
                <span>{t.lastSlip}</span>
                <strong>
                  {formatDate(new Date(a.lastSlip.start), locale)} – {formatDate(new Date(a.lastSlip.end), locale)}
                </strong>
                <small>
                  {t.openInHr} <ArrowUpRight size={13} aria-hidden="true" />
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
  return parseApiDate(s)?.getTime() ?? -Infinity;
}

/** The 3 tasks that went overdue most recently (latest due date first). */
function overduePreview(slug: string, work: MyWork, locale: Locale): WorkPreview[] {
  const t = TEXT[locale];
  return work.tasks
    .filter((task) => isOverdue(task))
    .sort((a, b) => timeOf(b.dueDate) - timeOf(a.dueDate))
    .slice(0, 3)
    .map((task) => ({
      key: task.taskId,
      href: taskDeepLink(slug, task),
      title: task.title || t.untitled,
      sub: `${task.workspaceName} › ${task.projectName}`,
      when: task.dueDate ? t.due(formatDue(task.dueDate, locale)) : null,
      late: true,
    }));
}

/** The 3 newest approval requests, HR leave/OT and Task workflow together (newest submission first). */
function approvalsPreview(slug: string, base: string, work: MyWork | null, hr: HrApproval[] | null, locale: Locale): WorkPreview[] {
  const t = TEXT[locale];
  const items = [
    ...(hr ?? []).map((a) => ({
      at: a.requestedAt,
      key: `hr:${a.db}:${a.type}:${a.requestId}`,
      href: `${base}/go/hr?${new URLSearchParams({ to: a.type === "AS" ? "approve-leave" : "approve-ot", db: a.db })}`,
      title: `${a.type === "AS" ? t.leave : "OT"} · ${a.employeeName || "-"}`,
      sub: `HR · ${a.kind}`,
    })),
    ...(work?.approvals ?? []).map((a) => ({
      at: a.submittedAt,
      key: `task:${a.taskId}:${a.stepName}`,
      href: taskDeepLink(slug, a),
      title: a.title || t.untitled,
      sub: t.step(a.stepName),
    })),
  ];
  return items
    .sort((a, b) => timeOf(b.at) - timeOf(a.at))
    .slice(0, 3)
    .map(({ at, ...p }) => {
      const sent = parseApiDate(at);
      return { ...p, when: sent ? t.sent(formatDateTime(sent, locale)) : null };
    });
}

function PreviewList({ title, items, total, href, empty, t }: { title: string; items: WorkPreview[]; total: number; href: string; empty: string; t: T }) {
  return (
    <div className="wpreview">
      <div className="wpreview-head">
        <b>{title}</b>
        <Link href={href} className="inline-link">
          {t.more}{total > items.length ? ` (${total})` : ""} <ChevronRight size={14} aria-hidden="true" />
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
 * "To do": counts from Task/HR; each opens My Work on that list, and the latest 3 overdue tasks and
 * approval requests are listed under them. Without counts it's the loading state.
 */
function WorkDashboard({
  base,
  t,
  counts,
  previews,
  failed,
}: {
  base: string;
  t: T;
  counts?: { open: number; overdue: number; approvals: number };
  previews?: WorkPreviews;
  failed?: boolean;
}) {
  const items = [
    { tab: "tasks", label: t.myTasks, n: counts?.open, warn: false },
    { tab: "overdue", label: t.overdue, n: counts?.overdue, warn: true },
    { tab: "approvals", label: t.approvals, n: counts?.approvals, warn: false },
  ];
  return (
    <section className="card panel" aria-label={t.todo} style={{ marginBottom: 16 }}>
      <div className="sec-header">
        <div>
          <h3>{t.todo}</h3>
          <p>{failed ? t.unreachable : t.todoLead}</p>
        </div>
        <Link href={`${base}/my-work`} className="btn tiny">
          {t.seeAll} <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="workstats">
        {items.map((i) => (
          <Link key={i.tab} href={`${base}/my-work?tab=${i.tab}`} className={`workstat ${i.warn && i.n ? "warn" : ""}`}>
            <span>
              {i.label}
              <small>{i.tab === "approvals" ? t.approvalSources : t.assignedToMe}</small>
            </span>
            <b>{i.n ?? (failed ? "–" : "…")}</b>
          </Link>
        ))}
      </div>
      {previews && counts && (
        <div className="workpreviews">
          <PreviewList title={t.latestOverdue} items={previews.overdue} total={counts.overdue} href={`${base}/my-work?tab=overdue`} empty={previews.overdueNote} t={t} />
          <PreviewList title={t.latestApprovals} items={previews.approvals} total={counts.approvals} href={`${base}/my-work?tab=approvals`} empty={t.noApprovals} t={t} />
        </div>
      )}
    </section>
  );
}

async function MyWorkDashboard({ member, base, locale }: { member: Member; base: string; locale: Locale }) {
  const t = TEXT[locale];
  const [work, hr] = await Promise.all([getMyWork(member), getHrApprovals(member)]);
  if (!work && !hr) return member.org.taskEnabled ? <WorkDashboard base={base} t={t} failed /> : null;
  const counts = workCounts(work ?? { tasks: [], approvals: [] });
  counts.approvals += hr?.length ?? 0;
  const slug = member.org.slug;
  const previews: WorkPreviews = {
    overdue: work ? overduePreview(slug, work, locale) : [],
    overdueNote: work ? t.noOverdue : t.taskUnreachable,
    approvals: approvalsPreview(slug, base, work, hr, locale),
  };
  return <WorkDashboard base={base} t={t} counts={counts} previews={previews} />;
}
