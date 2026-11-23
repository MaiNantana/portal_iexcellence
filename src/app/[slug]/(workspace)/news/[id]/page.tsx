import Link from "next/link";
import { ChevronLeft, Download, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { acknowledgeNews } from "@/app/actions";
import { orgPath, requireMember } from "@/lib/context";
import { db } from "@/lib/db";
import { formatFileSize, isInlineImage } from "@/lib/news-files";
import { channelLabel, newsWhere } from "@/lib/portal";
import { defineText, formatDateTime, withLocale } from "@/i18n";
import { getLocale } from "@/i18n/server";

const TEXT = defineText({
  th: {
    back: "กลับหน้าแรก",
    edited: (when: string) => `ประกาศนี้มีการแก้ไขเมื่อ ${when} กรุณาอ่านเนื้อหาล่าสุดและกดรับทราบ`,
    lastEdited: (when: string) => ` · แก้ไขล่าสุด ${when}`,
    acked: (when: string) => `รับทราบแล้ว ✓ · ${when}`,
    ack: "รับทราบประกาศ",
  },
  en: {
    back: "Back to home",
    edited: (when: string) => `This announcement was edited on ${when}. Please read the latest version and acknowledge it.`,
    lastEdited: (when: string) => ` · last edited ${when}`,
    acked: (when: string) => `Acknowledged ✓ · ${when}`,
    ack: "Acknowledge",
  },
});

export default async function NewsPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const member = await requireMember(slug);
  const locale = await getLocale();
  const t = TEXT[locale];
  const news = await db.news.findFirst({
    where: { id, ...newsWhere(member) },
    include: { attachments: { select: { id: true, name: true, mime: true, size: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!news) notFound();
  const ack = news.requiresAck
    ? await db.newsAck.findUnique({ where: { newsId_userId: { newsId: news.id, userId: member.userId } } })
    : null;

  const base = withLocale(locale, orgPath(slug));
  const fileUrl = (fileId: string) => `${base}/news-file/${fileId}`;
  const images = news.attachments.filter((a) => isInlineImage(a.mime));
  const files = news.attachments.filter((a) => !isInlineImage(a.mime));

  return (
    <article className="card panel article">
      <Link href={`${base}#news`} className="inline-link">
        <ChevronLeft size={15} aria-hidden="true" /> {t.back}
      </Link>
      <div style={{ marginTop: 14 }}>
        <span className="chip">{channelLabel(news.channel, locale)}</span>
      </div>
      <h1>{news.title}</h1>
      {news.editedAt && news.requiresAck && !ack && (
        <div className="notice warn" style={{ marginBottom: 14 }}>
          {t.edited(formatDateTime(news.editedAt, locale))}
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
        {news.authorName} · {formatDateTime(news.publishedAt, locale)}
        {news.editedAt && t.lastEdited(formatDateTime(news.editedAt, locale))}
      </div>
      {news.requiresAck && (
        <div className="form-actions">
          {ack ? (
            <button className="btn primary" disabled>
              {t.acked(formatDateTime(ack.ackedAt, locale))}
            </button>
          ) : (
            <form action={acknowledgeNews.bind(null, slug, news.id)}>
              <button className="btn primary">{t.ack}</button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
