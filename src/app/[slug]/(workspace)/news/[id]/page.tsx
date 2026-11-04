import Link from "next/link";
import { notFound } from "next/navigation";
import { acknowledgeNews } from "@/app/actions";
import { orgPath, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { channelLabel, formatThaiDate, newsWhere } from "@/lib/portal";

export default async function NewsPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const member = await requireMember(slug);
  const news = await db.news.findFirst({ where: { id, ...newsWhere(member) } });
  if (!news) notFound();
  const ack = news.requiresAck
    ? await db.newsAck.findUnique({ where: { newsId_userId: { newsId: news.id, userId: member.userId } } })
    : null;

  return (
    <article className="card panel article">
      <Link href={orgPath(slug, "#news")} className="inline-link">
        ‹ กลับหน้าแรก
      </Link>
      <div style={{ marginTop: 14 }}>
        <span className="chip">{channelLabel(news.channel)}</span>
      </div>
      <h1>{news.title}</h1>
      <p className="body">{news.body}</p>
      <div className="notice">
        {news.authorName} · {formatThaiDate(news.publishedAt)}
      </div>
      {news.requiresAck && (
        <div className="form-actions">
          {ack ? (
            <button className="btn primary" disabled>
              รับทราบแล้ว ✓ · {formatThaiDate(ack.ackedAt)}
            </button>
          ) : (
            <form action={acknowledgeNews.bind(null, slug, news.id)}>
              <button className="btn primary">รับทราบประกาศ</button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
