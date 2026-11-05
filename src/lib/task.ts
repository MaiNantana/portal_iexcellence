import { orgPath, type Member } from "@/lib/context";
import { signHandoff } from "@/lib/handoff";
import { TASK_API_URL } from "@/lib/portal";

// Read API of TaskExcellence (functions/server.ts, /api/portal/*): server-to-server, authenticated
// by a 60-second Portal token for the member (aud "taskexcellence-api"). Task decides what the
// member can see, so the Portal never shows Task data the member couldn't open in Task itself.

export type TaskRef = { taskId: string; title: string; workspaceId: string; workspaceName: string; projectId: string; projectName: string };
export type MyTask = TaskRef & { status: { label: string; color: string | null } | null; dueDate: string | null; isDone: boolean };
export type MyApproval = TaskRef & { stepName: string; submittedAt: string | null };
export type MyWork = { tasks: MyTask[]; approvals: MyApproval[] };
export type TaskWorkspace = { id: string; name: string; projects: { id: string; name: string }[] };

// Home and My Work both ask for the same data on one visit; keep it briefly per member.
const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_MS = 20_000;

async function taskApi<T>(member: Member, path: string): Promise<T> {
  const key = `${member.userId}:${path}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const res = await fetch(new URL(path, TASK_API_URL), {
    headers: { Authorization: `Bearer ${await signHandoff(member, "taskexcellence-api")}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Task ${path}: ${res.status} ${await res.text()}`);
  const value = (await res.json()) as T;
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** The member's Task work, or null if Task isn't connected or can't be reached. */
export async function getMyWork(member: Member): Promise<MyWork | null> {
  if (!member.org.taskEnabled) return null;
  try {
    const work = await taskApi<MyWork>(member, "/api/portal/my-work");
    return { tasks: work.tasks ?? [], approvals: work.approvals ?? [] };
  } catch (err) {
    console.error("[task] my-work failed:", err);
    return null;
  }
}

export async function getTaskProjects(member: Member): Promise<TaskWorkspace[] | null> {
  try {
    return (await taskApi<{ workspaces: TaskWorkspace[] }>(member, "/api/portal/projects")).workspaces ?? [];
  } catch (err) {
    console.error("[task] projects failed:", err);
    return null;
  }
}

/** Bangkok calendar day, so "overdue" flips at local midnight. */
function bangkokDay(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
}

export function isOverdue(t: MyTask, now = new Date()) {
  if (t.isDone || !t.dueDate) return false;
  const due = new Date(t.dueDate);
  return !Number.isNaN(due.getTime()) && bangkokDay(due) < bangkokDay(now);
}

export function workCounts(work: MyWork) {
  const open = work.tasks.filter((t) => !t.isDone);
  return { open: open.length, overdue: open.filter((t) => isOverdue(t)).length, approvals: work.approvals.length };
}

/** Portal link that signs in to Task and opens a project, its form, or one task's detail. */
export function taskDeepLink(slug: string, target: { workspaceId: string; projectId: string; taskId?: string; form?: boolean }) {
  const q = new URLSearchParams({ ws: target.workspaceId, proj: target.projectId });
  if (target.taskId) q.set("task", target.taskId);
  if (target.form) q.set("form", "1");
  return `${orgPath(slug, "/go/task")}?${new URLSearchParams({ to: `/?${q}` })}`;
}
