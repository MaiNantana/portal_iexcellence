import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { syncMemberships } from "@/lib/identity";
import { isSuperadmin } from "@/lib/superadmin";

/** Only same-site paths are allowed as post-login destinations. */
export function safeNext(raw: unknown) {
  const next = String(raw ?? "");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/** URL of a page inside a tenant, e.g. orgPath("abc", "/admin") → "/abc/admin". */
export function orgPath(slug: string, path = "") {
  return `/${slug}${path}`;
}

/** Login page for a destination: the company's own login (/abc/login) for tenant paths, else the root. */
export function loginPath(next: string) {
  const slug = next.split(/[/?#]/)[1];
  return `${slug ? orgPath(slug, "/login") : "/"}?next=${encodeURIComponent(next)}`;
}

/**
 * Redirect from a route handler to a page on this site. The Location stays relative because
 * behind IIS `req.url` reads https://localhost:3000, so it can't be used to build a URL.
 */
export function seeOther(path: string) {
  return new Response(null, { status: 303, headers: { Location: path } });
}

/** The signed-in user, or null. */
export async function currentUser() {
  const session = await auth();
  return session?.user?.id ? db.user.findUnique({ where: { id: session.user.id } }) : null;
}

/**
 * The person really signed in: the superadmin while they act as someone (สวมรอย), else the user.
 * `acting` is the user being acted as, or null.
 */
export const realUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const real = await db.user.findUnique({ where: { id: session.realUserId ?? session.user.id } });
  if (!real) return null;
  const acting = session.realUserId ? await db.user.findUnique({ where: { id: session.user.id } }) : null;
  return { user: real, acting, superadmin: isSuperadmin(real.email) };
});

/** The signed-in user, whether or not they belong to any org yet. */
export const requireUser = cache(async (next = "/") => {
  const user = await currentUser();
  if (!user) redirect(loginPath(next));
  return user;
});

/**
 * Where "/" sends a signed-in user: their last-used tenant, else their first one, else null (onboarding).
 * Also picks up invitations / verified domains that appeared since they signed in.
 */
export async function homePathFor(userId: string, email: string, lastOrgId: string | null) {
  const select = { org: { select: { slug: true } } } as const;
  let member = lastOrgId ? await db.membership.findUnique({ where: { orgId_userId: { orgId: lastOrgId, userId } }, select }) : null;
  if (!member && !(await db.membership.count({ where: { userId } }))) await syncMemberships(userId, email);
  member ??= await db.membership.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select });
  return member ? orgPath(member.org.slug) : null;
}

/**
 * The signed-in user's membership in the tenant named by the URL slug. Every tenant page and
 * action goes through this; it is checked against the DB on each call, so a removed member loses
 * access immediately and a URL for a company you don't belong to is simply a 404.
 */
export const requireMember = cache(async (slug: string) => {
  const user = await requireUser(orgPath(slug));
  const member = await db.membership.findFirst({
    where: { userId: user.id, org: { slug } },
    include: { org: true, user: true },
  });
  if (!member) notFound();
  // Acting as someone must not move their own "last used company".
  if (user.lastOrgId !== member.orgId && !(await auth())?.realUserId) {
    await db.user.update({ where: { id: user.id }, data: { lastOrgId: member.orgId } });
  }
  return member;
});

export type Member = Awaited<ReturnType<typeof requireMember>>;

export async function requireAdmin(slug: string) {
  const member = await requireMember(slug);
  if (member.role !== "ADMIN") redirect(orgPath(slug));
  return member;
}

/** Tenant slug carried by a form (hidden "org" field) for actions that take FormData. */
export function slugFrom(form: FormData) {
  return String(form.get("org") ?? "");
}
