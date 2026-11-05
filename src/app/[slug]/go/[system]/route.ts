import { auth } from "@/auth";
import { loginPath, orgPath, safeNext, type Member } from "@/lib/context";
import { db } from "@/lib/db";
import { portalIssuer, signHandoff } from "@/lib/handoff";
import { HR_TARGETS, hrAppUrl, hrCustomer } from "@/lib/hr";
import { TASK_API_URL, TASK_BASE_URL } from "@/lib/portal";
import { decryptSecret } from "@/lib/secrets";

/**
 * Makes sure the member is in the company's Task workspace, using Task's existing
 * POST /api/external/connect (creates the Task account if needed). Best effort: if it fails,
 * the user is still signed in to Task, just without the company workspace.
 */
async function connectToCompanyWorkspace(apiUrl: string, apiKeyEnc: string, email: string) {
  try {
    const res = await fetch(new URL("/api/external/connect", apiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": decryptSecret(apiKeyEnc) },
      body: JSON.stringify({ email, sourceUrl: portalIssuer() }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`[go/task] connect failed: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error("[go/task] connect failed:", err);
  }
}

/**
 * /abc/go/task?to=/path — signs the member into TaskExcellence without a second login.
 * Redirects to Task's /portal-login with the token in the URL fragment, which browsers never
 * send to servers, so it doesn't end up in access logs or Referer headers.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; system: string }> }) {
  const { slug, system } = await params;
  if (system !== "task" && system !== "hr") return new Response("Not found", { status: 404 });
  const here = new URL(req.url);

  const session = await auth();
  if (!session?.user?.id) return Response.redirect(new URL(loginPath(here.pathname + here.search), req.url), 303);
  const member = await db.membership.findFirst({
    where: { userId: session.user.id, org: { slug } },
    include: { org: true, user: true },
  });
  if (!member) return new Response("Not found", { status: 404 });
  const { org } = member;
  if (system === "hr") return goToHr(req, member, here.searchParams.get("to"), here.searchParams.get("db"));
  if (!org.taskEnabled) return Response.redirect(new URL(orgPath(slug), req.url), 303);

  if (org.taskApiKeyEnc) await connectToCompanyWorkspace(TASK_API_URL, org.taskApiKeyEnc, member.user.email);

  const token = await signHandoff(member, "taskexcellence");
  const target = new URL("/portal-login", TASK_BASE_URL);
  target.hash = new URLSearchParams({ token, to: safeNext(here.searchParams.get("to")) }).toString();
  return handoffRedirect(target);
}

/**
 * /abc/go/hr — first time: link the HR account (/abc/hr-link). After that: HR's PortalLogin.ashx,
 * which signs the linked HR user in. Admins land in HR's back office, everyone else in self-service;
 * ?to=approve-leave|approve-ot opens the approver's leave / OT list instead. Members linked to
 * several HR databases pick one: ?db=<name>, or /abc/hr-link lists them to choose from.
 */
async function goToHr(req: Request, member: Member, to: string | null, dbName: string | null) {
  const { org } = member;
  if (!org.hrEnabled || !org.hrBaseUrl) return Response.redirect(new URL(orgPath(org.slug), req.url), 303);
  const links = await db.accountLink.findMany({ where: { orgId: org.id, userId: member.userId, system: "HR" } });
  const link = links.length === 1 ? links[0] : links.find((l) => l.externalDb === dbName);
  if (!link) {
    const pick = new URL(orgPath(org.slug, "/hr-link"), req.url);
    if (links.length && to && HR_TARGETS.has(to)) pick.searchParams.set("to", to);
    return Response.redirect(pick, 303);
  }

  const token = await signHandoff(member, "hrexcellence", {
    hr_token: link.externalUserId,
    hr_cust: hrCustomer(org.hrBaseUrl),
    mode: member.role === "ADMIN" ? "backoffice" : "self",
    ...(to && HR_TARGETS.has(to) ? { to } : {}),
  });
  const target = hrAppUrl(org.hrBaseUrl, "PortalLogin.ashx");
  target.hash = new URLSearchParams({ token }).toString();
  return handoffRedirect(target);
}

function handoffRedirect(target: URL) {
  return new Response(null, {
    status: 303,
    headers: { Location: target.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
