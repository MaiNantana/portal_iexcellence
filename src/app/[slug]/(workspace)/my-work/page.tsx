import Link from "next/link";
import { orgPath, requireMember } from "@/lib/context";
import { formatThaiDate } from "@/lib/portal";
import type { HrApproval } from "@/lib/hr";
import { getHrApprovals, hrDbCaptions } from "@/lib/hr-work";
import { getMyWork, isOverdue, taskDeepLink, workCounts, type MyTask } from "@/lib/task";

const TABS = [
  ["tasks", "งานของฉัน"],
  ["overdue", "งานเกินกำหนด"],
  ["approvals", "รออนุมัติ"],
] as const;

/** My Work: the member's Task work in one list; each row opens that task's detail in Task directly. */
export default async function MyWorkPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; done?: string }> }) {
  const { slug } = await params;
  const member = await requireMember(slug);
  const { tab: rawTab, done } = await searchParams;
  const tab = TABS.some(([k]) => k === rawTab) ? rawTab! : "tasks";
  const base = orgPath(slug);
  const [taskWork, hrApprovals] = await Promise.all([getMyWork(member), getHrApprovals(member)]);

  if (!taskWork && !hrApprovals) {
    return (
      <article className="card panel article">
        <h1>งานของฉัน</h1>
        <div className="notice">
          {member.org.taskEnabled ? "ติดต่อ TaskExcellence ไม่ได้ ลองใหม่อีกครั้ง" : "บริษัทยังไม่ได้เชื่อมต่อ TaskExcellence"}
        </div>
      </article>
    );
  }

  const work = taskWork ?? { tasks: [], approvals: [] };
  const counts = workCounts(work);
  counts.approvals += hrApprovals?.length ?? 0;
  const showDone = done === "1";
  const tasks = (tab === "overdue" ? work.tasks.filter((t) => isOverdue(t)) : work.tasks.filter((t) => showDone || !t.isDone)).sort(byDue);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">My Work</span>
          <h2>งานของฉัน</h2>
        </div>
      </div>
      <nav className="adminmenu">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`${base}/my-work?tab=${k}`} className={tab === k ? "on" : ""}>
            {label} ({k === "tasks" ? counts.open : k === "overdue" ? counts.overdue : counts.approvals})
          </Link>
        ))}
      </nav>
      <section className="card panel">
        {tab === "approvals" ? (
          <>
            <h3>รออนุมัติ · HR (ลา / OT)</h3>
            <HrApprovals slug={slug} items={hrApprovals} hrEnabled={member.org.hrEnabled} hrBaseUrl={member.org.hrBaseUrl} />
            <h3 style={{ marginTop: 20 }}>รออนุมัติ · TaskExcellence</h3>
            {!taskWork && <div className="notice">{member.org.taskEnabled ? "ติดต่อ TaskExcellence ไม่ได้" : "บริษัทยังไม่ได้เชื่อมต่อ TaskExcellence"}</div>}
            {taskWork && work.approvals.length === 0 && <div className="empty">ไม่มีงานรออนุมัติ</div>}
            {work.approvals.map((a) => (
              <a key={`${a.taskId}:${a.stepName}`} className="workrow" href={taskDeepLink(slug, a)} target="_blank" rel="noopener noreferrer">
                <span className="quickicon task">☑</span>
                <span className="wtitle">
                  <b>{a.title || "(ไม่มีชื่อ)"}</b>
                  <small>
                    {a.workspaceName} › {a.projectName} · ขั้นตอน: {a.stepName}
                  </small>
                </span>
                {a.submittedAt && <span className="wdue">ส่งเมื่อ {formatThaiDate(new Date(a.submittedAt))}</span>}
                <span className="btn tiny light">อนุมัติ ↗</span>
              </a>
            ))}
          </>
        ) : (
          <>
            {tab === "tasks" && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Link className="inline-link" href={`${base}/my-work?tab=tasks${showDone ? "" : "&done=1"}`}>
                  {showDone ? "ซ่อนงานที่เสร็จแล้ว" : "แสดงงานที่เสร็จแล้วด้วย"}
                </Link>
              </div>
            )}
            {!taskWork && <div className="notice">{member.org.taskEnabled ? "ติดต่อ TaskExcellence ไม่ได้" : "บริษัทยังไม่ได้เชื่อมต่อ TaskExcellence"}</div>}
            {taskWork && tasks.length === 0 && <div className="empty" style={{ marginTop: 8 }}>{tab === "overdue" ? "ไม่มีงานเกินกำหนด" : "ไม่มีงานค้าง"}</div>}
            {tasks.map((t) => (
              <TaskRow key={t.taskId} slug={slug} task={t} />
            ))}
          </>
        )}
      </section>
    </>
  );
}

async function HrApprovals({ slug, items, hrEnabled, hrBaseUrl }: { slug: string; items: HrApproval[] | null; hrEnabled: boolean; hrBaseUrl: string | null }) {
  if (!hrEnabled) return <div className="notice">บริษัทยังไม่ได้เชื่อมต่อ HR</div>;
  if (!items) {
    return (
      <div className="notice">
        ยังดูรายการจาก HR ไม่ได้ ·{" "}
        <Link className="inline-link" href={orgPath(slug, "/hr-link")}>
          เชื่อมบัญชี HR
        </Link>{" "}
        ก่อน หรือลองใหม่อีกครั้ง
      </div>
    );
  }
  if (items.length === 0) return <div className="empty">ไม่มีใบลา / OT รออนุมัติ</div>;
  // Name the database only when the requests come from more than one.
  const captions = new Set(items.map((a) => a.db)).size > 1 && hrBaseUrl ? await hrDbCaptions(hrBaseUrl) : null;
  return (
    <>
      {items.map((a) => (
        <a
          key={`${a.db}:${a.type}:${a.requestId}`}
          className="workrow"
          href={`${orgPath(slug, "/go/hr")}?${new URLSearchParams({ to: a.type === "AS" ? "approve-leave" : "approve-ot", db: a.db })}`}
          target="_blank"
          rel="noopener noreferrer"
          title="เปิดหน้าอนุมัติใน HR Excellence"
        >
          <span className="quickicon hr">{a.type === "AS" ? "◷" : "⏱"}</span>
          <span className="wtitle">
            <b>
              {a.type === "AS" ? "ลางาน" : "OT"} · {a.employeeName || "-"}
            </b>
            <small>
              {captions && `${captions.get(a.db) ?? a.db} · `}
              {a.kind}
              {a.startDate && ` · ${formatThaiDate(new Date(a.startDate))}`}
              {a.endDate && a.endDate !== a.startDate && ` – ${formatThaiDate(new Date(a.endDate))}`}
            </small>
          </span>
          {a.requestedAt && <span className="wdue">ส่งเมื่อ {formatThaiDate(new Date(a.requestedAt))}</span>}
          <span className="btn tiny light">อนุมัติ ↗</span>
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

function TaskRow({ slug, task }: { slug: string; task: MyTask }) {
  const late = isOverdue(task);
  const due = task.dueDate ? new Date(task.dueDate) : null;
  return (
    <a className="workrow" href={taskDeepLink(slug, task)} target="_blank" rel="noopener noreferrer" title="เปิดรายละเอียดงานใน TaskExcellence">
      <span className="quickicon task">☑</span>
      <span className="wtitle">
        <b>{task.title || "(ไม่มีชื่อ)"}</b>
        <small>
          {task.workspaceName} › {task.projectName}
        </small>
      </span>
      {task.status && (
        <span className="chip" style={task.status.color ? { background: task.status.color, color: "#fff" } : undefined}>
          {task.status.label}
        </span>
      )}
      {due && !Number.isNaN(due.getTime()) && <span className={`wdue ${late ? "late" : ""}`}>{late ? "เกินกำหนด " : "กำหนด "}{formatThaiDate(due)}</span>}
      <span className="btn tiny light">เปิด ↗</span>
    </a>
  );
}
