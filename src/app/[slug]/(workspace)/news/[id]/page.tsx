import Link from "next/link";
import { ChevronLeft, Download, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { acknowledgeNews } from "@/app/actions";
import { orgPath, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { formatFileSize, isInlineImage } from "@/lib/news-files";
import { channelLabel, formatThaiDate, newsWhere } from "@/lib/portal";

export default async function NewsPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const member = await requireMember(slug);
  const news = await db.news.findFirst({
    where: { id, ...newsWhere(member) },
    include: { attachments: { select: { id: true, name: true, mime: true, size: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!news) notFound();
  const ack = news.requiresAck
    ? await db.newsAck.findUnique({ where: { newsId_userId: { newsId: news.id, userId: member.userId } } })
    : null;

  const fileUrl = (fileId: string) => orgPath(slug, `/news-file/${fileId}`);
  const images = news.attachments.filter((a) => isInlineImage(a.mime));
  const files = news.attachments.filter((a) => !isInlineImage(a.mime));

  return (
    <article className="card panel article">
      <Link href={orgPath(slug, "#news")} className="inline-link">
        <ChevronLeft size={15} aria-hidden="true" /> กลับหน้าแรก
      </Link>
      <div style={{ marginTop: 14 }}>
        <span className="chip">{channelLabel(news.channel)}</span>
      </div>
      <h1>{news.title}</h1>
      {news.editedAt && news.requiresAck && !ack && (
        <div className="notice warn" style={{ marginBottom: 14 }}>
          ประกาศนี้มีการแก้ไขเมื่อ {formatThaiDate(news.editedAt)} กรุณาอ่านเนื้อหาล่าสุดและกดรับทราบ
        </div>
      )}
      <p className="body">{news.body}</p>
      {images.map((a) => (
        // eslint-disable-next-line @next/next/no-img-element -- served by our own authenticated route
        <img key={a.id} className="article-img" src={fileUrl(a.id)} alt={a.name} />
      ))}
      {files.length > 0 && (
        <div className="filelist">
          {files.map((a) => (
            <a key={a.id} href={fileUrl(a.id)} className="fileitem">
              <FileText size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>
                <b>{a.name}</b>
                <small>{formatFileSize(a.size)}</small>
              </span>
              <Download size={16} strokeWidth={1.75} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
      <div className="notice">
        {news.authorName} · {formatThaiDate(news.publishedAt)}
        {news.editedAt && ` · แก้ไขล่าสุด ${formatThaiDate(news.editedAt)}`}
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
