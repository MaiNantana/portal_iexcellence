import { auth } from "@/auth";
import { loginPath } from "@/lib/context";
import { db } from "@/lib/db";
import { isInlineImage } from "@/lib/news-files";
import { newsWhere } from "@/lib/portal";

/** /abc/news-file/<id> — a post's attachment, for members who can see that post (admins: any post in the company). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const session = await auth();
  if (!session?.user?.id) return Response.redirect(new URL(loginPath(new URL(req.url).pathname), req.url), 303);
  const member = await db.membership.findFirst({
    where: { userId: session.user.id, org: { slug } },
    include: { org: true, user: true },
  });
  if (!member) return new Response("Not found", { status: 404 });

  const file = await db.newsAttachment.findFirst({
    where: { id, news: member.role === "ADMIN" ? { orgId: member.orgId } : newsWhere(member) },
  });
  if (!file) return new Response("Not found", { status: 404 });

  const disposition = isInlineImage(file.mime) ? "inline" : "attachment";
  return new Response(file.data, {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
