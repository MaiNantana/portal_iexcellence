import Link from "next/link";
import { orgPath, requireMember } from "@/lib/context";
import { formatThaiDate } from "@/lib/portal";
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
  const work = await getMyWork(member);

  if (!work) {
    return (
      <article className="card panel article">
        <h1>งานของฉัน</h1>
        <div className="notice">
          {member.org.taskEnabled ? "ติดต่อ TaskExcellence ไม่ได้ ลองใหม่อีกครั้ง" : "บริษัทยังไม่ได้เชื่อมต่อ TaskExcellence"}
        </div>
      </article>
    );
  }

  const counts = workCounts(work);
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
            <h3>รออนุมัติ · TaskExcellence</h3>
            {work.approvals.length === 0 && <div className="empty">ไม่มีงานรออนุมัติ</div>}
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
            <h3 style={{ marginTop: 20 }}>รออนุมัติ · HR (ลา / OT)</h3>
            <div className="notice">
              อนุมัติใบลาและ OT ได้ที่ HR Excellence โดยตรง ·{" "}
              {member.org.hrEnabled ? (
                <a className="inline-link" href={`${base}/go/hr`} target="_blank" rel="noopener noreferrer">
                  เปิด HR ↗
                </a>
              ) : (
                "บริษัทยังไม่ได้เชื่อมต่อ HR"
              )}
            </div>
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
            {tasks.length === 0 && <div className="empty" style={{ marginTop: 8 }}>{tab === "overdue" ? "ไม่มีงานเกินกำหนด" : "ไม่มีงานค้าง"}</div>}
            {tasks.map((t) => (
              <TaskRow key={t.taskId} slug={slug} task={t} />
            ))}
          </>
        )}
      </section>
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
