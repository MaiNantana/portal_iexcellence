import { auth } from "@/auth";
import { homePathFor, seeOther } from "@/lib/context";
import { db } from "@/lib/db";

/**
 * Stable link for other apps (Task's My Account › Notifications): opens this person's
 * notification-channel page in the company they used last, or sign-in first.
 */
export async function GET() {
  const session = await auth();
  const user = session?.user?.id ? await db.user.findUnique({ where: { id: session.user.id } }) : null;
  if (!user) return seeOther(`/?next=${encodeURIComponent("/api/me/notifications")}`);
  const home = await homePathFor(user.id, user.email, user.lastOrgId);
  return seeOther(home ? `${home}/notifications` : "/");
}
