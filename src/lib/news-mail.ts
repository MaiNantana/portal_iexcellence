import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";

function excerpt(body: string) {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/**
 * Emails every post that is live and still owes its notification: new posts, scheduled posts whose
 * time has come, and posts an admin edited with "แจ้งทางอีเมล" on. Each post is claimed first, so
 * overlapping runs can't send twice. A failed address is logged and not retried.
 */
export async function sendDueNewsEmails() {
  const now = new Date();
  const due = await db.news.findMany({
    where: { notifyEmail: true, notifiedAt: null, publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    include: { org: { select: { name: true, slug: true } } },
    take: 20,
  });
  const portalUrl = process.env.AUTH_URL ?? "http://localhost:3000";

  for (const news of due) {
    const claimed = await db.news.updateMany({ where: { id: news.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
    if (!claimed.count) continue;

    const members = await db.membership.findMany({
      where: { orgId: news.orgId, ...(news.audience === "all" ? {} : { department: news.audience }) },
      select: { user: { select: { email: true } } },
    });
    const subject = `${news.editedAt ? "[มีการแก้ไข] " : ""}${news.title}`;
    const ask = news.requiresAck ? "ประกาศนี้ต้องกดรับทราบ กรุณาเข้าอ่านและกดรับทราบที่ลิงก์ด้านล่าง" : "อ่านประกาศฉบับเต็มได้ที่ลิงก์ด้านล่าง";
    const text = `${news.org.name} · ${news.editedAt ? "ประกาศมีการแก้ไข" : "ประกาศใหม่"}\n\n${news.title}\n\n${excerpt(news.body)}\n\n${ask}\n${portalUrl}/${news.org.slug}/news/${news.id}`;

    let failed = 0;
    for (const { user } of members) {
      try {
        await sendMail(user.email, subject, text);
      } catch (err) {
        failed++;
        console.error(`[news-mail] ${news.id} to ${user.email} failed:`, err);
      }
    }
    console.log(`[news-mail] ${news.id}: sent ${members.length - failed}/${members.length}`);
  }
}
