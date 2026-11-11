"use server";

import { notFound, redirect } from "next/navigation";
import { unstable_update } from "@/auth";
import { orgPath, realUser } from "@/lib/context";
import { db } from "@/lib/db";

async function requireSuperadmin() {
  const me = await realUser();
  if (!me?.superadmin) notFound();
  return me;
}

/** Superadmin acts as an admin of a company (สวมรอย) and lands on that company's home. */
export async function startActingAs(form: FormData) {
  const me = await requireSuperadmin();
  const userId = String(form.get("userId") ?? "");
  const slug = String(form.get("slug") ?? "");
  const member = await db.membership.findFirst({
    where: { userId, org: { slug } },
    include: { user: { select: { email: true } } },
  });
  if (!member) redirect("/superadmin");
  if (userId === me.user.id) {
    await unstable_update({ actAs: null } as never);
  } else {
    await unstable_update({ actAs: userId } as never);
    console.warn(`[superadmin] ${me.user.email} acts as ${member.user.email} in /${slug}`);
  }
  redirect(orgPath(slug));
}

/** Back to the superadmin's own account. */
export async function stopActingAs() {
  const me = await realUser();
  if (me?.acting) console.warn(`[superadmin] ${me.user.email} stopped acting as ${me.acting.email}`);
  await unstable_update({ actAs: null } as never);
  redirect(me?.superadmin ? "/superadmin" : "/");
}
