import { auth } from "@/auth";
import { loginPath, orgPath, safeNext } from "@/lib/context";
import { db } from "@/lib/db";
import { portalIssuer, signHandoff } from "@/lib/handoff";
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
  if (system !== "task") return new Response("Not found", { status: 404 });
  const here = new URL(req.url);

  const session = await auth();
  if (!session?.user?.id) return Response.redirect(new URL(loginPath(here.pathname + here.search), req.url), 303);
  const member = await db.membership.findFirst({
    where: { userId: session.user.id, org: { slug } },
    include: { org: true, user: true },
  });
  if (!member) return new Response("Not found", { status: 404 });
  const { org } = member;
  if (!org.taskEnabled) return Response.redirect(new URL(orgPath(slug), req.url), 303);

  if (org.taskApiKeyEnc) await connectToCompanyWorkspace(TASK_API_URL, org.taskApiKeyEnc, member.user.email);

  const token = await signHandoff(member, "taskexcellence");
  const target = new URL("/portal-login", TASK_BASE_URL);
  target.hash = new URLSearchParams({ token, to: safeNext(here.searchParams.get("to")) }).toString();
  return new Response(null, {
    status: 303,
    headers: { Location: target.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
