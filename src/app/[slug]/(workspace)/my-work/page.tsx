import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { orgPath, requireMember } from "@/lib/context";
import type { HrApproval } from "@/lib/hr";
import { getHrApprovals, hrDbCaptions } from "@/lib/hr-work";
import { getMyWork, isOverdue, taskDeepLink, workCounts, type MyTask } from "@/lib/task";
import { defineText, formatDate, withLocale, type Locale } from "@/i18n";
import { getLocale } from "@/i18n/server";

const TEXT = defineText({
  th: {
    tabs: { tasks: "งานของฉัน", overdue: "งานเกินกำหนด", approvals: "รออนุมัติ" },
    title: "งานของฉัน",
    taskUnreachableRetry: "ติดต่อ TaskExcellence ไม่ได้ ลองใหม่อีกครั้ง",
    taskOff: "บริษัทยังไม่ได้เชื่อมต่อ TaskExcellence",
    taskUnreachable: "ติดต่อ TaskExcellence ไม่ได้",
    hrApprovals: "รออนุมัติ · HR (ลา / OT)",
    taskApprovals: "รออนุมัติ · TaskExcellence",
    noApprovals: "ไม่มีงานรออนุมัติ",
    untitled: "(ไม่มีชื่อ)",
    step: "ขั้นตอน:",
    sent: "ส่งเมื่อ",
    approve: "อนุมัติ",
    hideDone: "ซ่อนงานที่เสร็จแล้ว",
    showDone: "แสดงงานที่เสร็จแล้วด้วย",
    noOverdue: "ไม่มีงานเกินกำหนด",
    noOpen: "ไม่มีงานค้าง",
    hrOff: "บริษัทยังไม่ได้เชื่อมต่อ HR",
    hrUnavailableA: "ยังดูรายการจาก HR ไม่ได้ ·",
    linkHr: "เชื่อมบัญชี HR",
    hrUnavailableB: "ก่อน หรือลองใหม่อีกครั้ง",
    noHrApprovals: "ไม่มีใบลา / OT รออนุมัติ",
    openHrApproval: "เปิดหน้าอนุมัติใน HR Excellence",
    leave: "ลางาน",
    openTask: "เปิดรายละเอียดงานใน TaskExcellence",
    late: "เกินกำหนด",
    due: "กำหนด",
    open: "เปิด",
  },
  en: {
    tabs: { tasks: "My tasks", overdue: "Overdue", approvals: "Approvals" },
    title: "My work",
    taskUnreachableRetry: "Can't reach TaskExcellence. Please try again.",
    taskOff: "Your company hasn't connected TaskExcellence yet",
    taskUnreachable: "Can't reach TaskExcellence",
    hrApprovals: "Waiting for approval · HR (leave / OT)",
    taskApprovals: "Waiting for approval · TaskExcellence",
    noApprovals: "Nothing waiting for approval",
    untitled: "(untitled)",
    step: "step:",
    sent: "Sent",
    approve: "Approve",
    hideDone: "Hide finished tasks",
    showDone: "Show finished tasks too",
    noOverdue: "Nothing overdue",
    noOpen: "No open tasks",
    hrOff: "Your company hasn't connected HR yet",
    hrUnavailableA: "Can't show HR requests yet ·",
    linkHr: "link your HR account",
    hrUnavailableB: "first, or try again",
    noHrApprovals: "No leave / OT requests waiting for approval",
    openHrApproval: "Open the approval page in HR Excellence",
    leave: "Leave",
    openTask: "Open the task in TaskExcellence",
    late: "Overdue",
    due: "Due",
    open: "Open",
  },
});

type T = (typeof TEXT)["th"];
const TABS = ["tasks", "overdue", "approvals"] as const;

/** My Work: the member's Task work in one list; each row opens that task's detail in Task directly. */
export default async function MyWorkPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; done?: string }> }) {
  const { slug } = await params;
  const member = await requireMember(slug);
  const locale = await getLocale();
  const t = TEXT[locale];
  const { tab: rawTab, done } = await searchParams;
  const tab = TABS.find((k) => k === rawTab) ?? "tasks";
  const base = withLocale(locale, orgPath(slug));
  const [taskWork, hrApprovals] = await Promise.all([getMyWork(member), getHrApprovals(member)]);

  if (!taskWork && !hrApprovals) {
    return (
      <article className="card panel article">
        <h1>{t.title}</h1>
        <div className="notice">{member.org.taskEnabled ? t.taskUnreachableRetry : t.taskOff}</div>
      </article>
    );
  }

  const work = taskWork ?? { tasks: [], approvals: [] };
  const counts = workCounts(work);
  counts.approvals += hrApprovals?.length ?? 0;
  const showDone = done === "1";
  const tasks = (tab === "overdue" ? work.tasks.filter((x) => isOverdue(x)) : work.tasks.filter((x) => showDone || !x.isDone)).sort(byDue);
  const taskProblem = member.org.taskEnabled ? t.taskUnreachable : t.taskOff;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">My Work</span>
          <h2>{t.title}</h2>
        </div>
      </div>
      <nav className="adminmenu">
        {TABS.map((k) => (
          <Link key={k} href={`${base}/my-work?tab=${k}`} className={tab === k ? "on" : ""}>
            {t.tabs[k]} ({k === "tasks" ? counts.open : k === "overdue" ? counts.overdue : counts.approvals})
          </Link>
        ))}
      </nav>
      <section className="card panel">
        {tab === "approvals" ? (
          <>
            <h3>{t.hrApprovals}</h3>
            <HrApprovals base={base} items={hrApprovals} hrEnabled={member.org.hrEnabled} hrBaseUrl={member.org.hrBaseUrl} locale={locale} />
            <h3 style={{ marginTop: 20 }}>{t.taskApprovals}</h3>
            {!taskWork && <div className="notice">{taskProblem}</div>}
            {taskWork && work.approvals.length === 0 && <div className="empty">{t.noApprovals}</div>}
            {work.approvals.map((a) => (
              <a key={`${a.taskId}:${a.stepName}`} className="workrow" href={taskDeepLink(slug, a)} target="_blank" rel="noopener noreferrer">
                <span className="quickicon task"><AppIcon name="task" size={18} /></span>
                <span className="wtitle">
                  <b>{a.title || t.untitled}</b>
                  <small>
                    {a.workspaceName} › {a.projectName} · {t.step} {a.stepName}
                  </small>
                </span>
                {a.submittedAt && <span className="wdue">{t.sent} {formatDate(new Date(a.submittedAt), locale)}</span>}
                <span className="btn tiny light">{t.approve} <ArrowUpRight size={14} aria-hidden="true" /></span>
              </a>
            ))}
          </>
        ) : (
          <>
            {tab === "tasks" && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Link className="inline-link" href={`${base}/my-work?tab=tasks${showDone ? "" : "&done=1"}`}>
                  {showDone ? t.hideDone : t.showDone}
                </Link>
              </div>
            )}
            {!taskWork && <div className="notice">{taskProblem}</div>}
            {taskWork && tasks.length === 0 && <div className="empty" style={{ marginTop: 8 }}>{tab === "overdue" ? t.noOverdue : t.noOpen}</div>}
            {tasks.map((x) => (
              <TaskRow key={x.taskId} slug={slug} task={x} t={t} locale={locale} />
            ))}
          </>
        )}
      </section>
    </>
  );
}

async function HrApprovals({ base, items, hrEnabled, hrBaseUrl, locale }: { base: string; items: HrApproval[] | null; hrEnabled: boolean; hrBaseUrl: string | null; locale: Locale }) {
  const t = TEXT[locale];
  if (!hrEnabled) return <div className="notice">{t.hrOff}</div>;
  if (!items) {
    return (
      <div className="notice">
        {t.hrUnavailableA}{" "}
        <Link className="inline-link" href={`${base}/hr-link`}>
          {t.linkHr}
        </Link>{" "}
        {t.hrUnavailableB}
      </div>
    );
  }
  if (items.length === 0) return <div className="empty">{t.noHrApprovals}</div>;
  // Name the database only when the requests come from more than one.
  const captions = new Set(items.map((a) => a.db)).size > 1 && hrBaseUrl ? await hrDbCaptions(hrBaseUrl) : null;
  return (
    <>
      {items.map((a) => (
        <a
          key={`${a.db}:${a.type}:${a.requestId}`}
          className="workrow"
          href={`${base}/go/hr?${new URLSearchParams({ to: a.type === "AS" ? "approve-leave" : "approve-ot", db: a.db })}`}
          target="_blank"
          rel="noopener noreferrer"
          title={t.openHrApproval}
        >
          <span className="quickicon hr"><AppIcon name={a.type === "AS" ? "calendar" : "hr"} size={18} /></span>
          <span className="wtitle">
            <b>
              {a.type === "AS" ? t.leave : "OT"} · {a.employeeName || "-"}
            </b>
            <small>
              {captions && `${captions.get(a.db) ?? a.db} · `}
              {a.kind}
              {a.startDate && ` · ${formatDate(new Date(a.startDate), locale)}`}
              {a.endDate && a.endDate !== a.startDate && ` – ${formatDate(new Date(a.endDate), locale)}`}
            </small>
          </span>
          {a.requestedAt && <span className="wdue">{t.sent} {formatDate(new Date(a.requestedAt), locale)}</span>}
          <span className="btn tiny light">{t.approve} <ArrowUpRight size={14} aria-hidden="true" /></span>
        </a>
      ))}
    </>
  );
}

function byDue(a: MyTask, b: MyTask) {
  const da = a.dueDate ? Date.parse(a.dueDate) : Infinity;
  const dbb = b.dueDate ? Date.parse(b.dueDate) : Infinity;
  return (Number.isNaN(da) ? Infinity : da) - (Number.isNaN(dbb) ? Infinity : dbb);
}

function TaskRow({ slug, task, t, locale }: { slug: string; task: MyTask; t: T; locale: Locale }) {
  const late = isOverdue(task);
  const due = task.dueDate ? new Date(task.dueDate) : null;
  return (
    <a className="workrow" href={taskDeepLink(slug, task)} target="_blank" rel="noopener noreferrer" title={t.openTask}>
      <span className="quickicon task"><AppIcon name="task" size={18} /></span>
      <span className="wtitle">
        <b>{task.title || t.untitled}</b>
        <small>
          {task.workspaceName} › {task.projectName}
        </small>
      </span>
      {task.status && (
        <span className="chip" style={task.status.color ? { background: task.status.color, color: "#fff" } : undefined}>
          {task.status.label}
        </span>
      )}
      {due && !Number.isNaN(due.getTime()) && <span className={`wdue ${late ? "late" : ""}`}>{late ? t.late : t.due} {formatDate(due, locale)}</span>}
      <span className="btn tiny light">{t.open} <ArrowUpRight size={14} aria-hidden="true" /></span>
    </a>
  );
}
