import { auth } from "@/auth";
import { loginPath, orgPath, seeOther } from "@/lib/context";
import { db } from "@/lib/db";
import { getVisibleServices } from "@/lib/portal";
import { taskDeepLink } from "@/lib/task";

/**
 * /abc/go/service/<id> — a company service ("แจ้งซ่อม"): checks the member may use it, then signs
 * them in to Task (via /abc/go/task) straight into the mapped project, or its request form.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const here = new URL(req.url);
  const session = await auth();
  if (!session?.user?.id) return seeOther(loginPath(here.pathname));
  const member = await db.membership.findFirst({
    where: { userId: session.user.id, org: { slug } },
    include: { org: true, user: true },
  });
  if (!member) return new Response("Not found", { status: 404 });

  const service = (await getVisibleServices(member)).find((s) => s.id === id);
  if (!service) return seeOther(orgPath(slug));
  const target = taskDeepLink(slug, { workspaceId: service.taskWorkspaceId, projectId: service.taskProjectId, form: service.openMode === "form" });
  return seeOther(target);
}
