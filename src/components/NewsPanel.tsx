"use client";

import { ArrowUpRight, Bell, CalendarDays, ChevronDown, ChevronRight, ChevronUp, Factory, Megaphone, Monitor, Paperclip, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { NewsItem } from "@/lib/portal";
import { defineText } from "@/i18n";
import { useLocale } from "@/i18n/client";

const ICONS: Record<string, LucideIcon> = { hr: Users, it: Monitor, events: CalendarDays, production: Factory };

const TEXT = defineText({
  th: {
    region: "ข่าวสารและประกาศบริษัท",
    title: "ข่าวสารและประกาศ",
    count: (n: number) => `${n} ข่าว`,
    lead: "ประกาศที่ต้องรับทราบอยู่ก่อน · ข่าวล่าสุดอยู่ในกล่องเดียวกัน",
    pending: (n: number) => `${n} ประกาศที่ยังไม่รับทราบ`,
    show: "แสดงข่าวสาร",
    hide: "ยุบข่าวสาร",
    editedAck: "มีการแก้ไข · ต้องรับทราบ",
    importantAck: "ประกาศสำคัญ · ต้องรับทราบ",
    acked: "รับทราบแล้ว",
    latestNews: "ข่าวสารล่าสุด",
    readAck: "อ่านและรับทราบ",
    read: "อ่านประกาศ",
    empty: "ยังไม่มีข่าวสาร",
    latest: "ข่าวล่าสุด",
    compact: "แสดงแบบย่อ",
    all: "ดูข่าวทั้งหมด",
    allChannels: "ทั้งหมด",
    hasFiles: "มีไฟล์แนบ",
    editedWaiting: "แก้ไขแล้ว · รอรับทราบ",
    waiting: "รอรับทราบ",
    emptyChannel: "ไม่มีข่าวใน Channel นี้",
  },
  en: {
    region: "Company news and announcements",
    title: "News and announcements",
    count: (n: number) => `${n} post${n === 1 ? "" : "s"}`,
    lead: "Announcements to acknowledge come first · the latest news is in the same box",
    pending: (n: number) => `${n} announcement${n === 1 ? "" : "s"} to acknowledge`,
    show: "Show news",
    hide: "Hide news",
    editedAck: "Edited · please acknowledge",
    importantAck: "Important · please acknowledge",
    acked: "Acknowledged",
    latestNews: "Latest news",
    readAck: "Read and acknowledge",
    read: "Read",
    empty: "No news yet",
    latest: "Latest news",
    compact: "Show less",
    all: "See all news",
    allChannels: "All",
    hasFiles: "Has attachments",
    editedWaiting: "Edited · to acknowledge",
    waiting: "To acknowledge",
    emptyChannel: "No news in this channel",
  },
});

export function NewsPanel({ items, channels, base }: { items: NewsItem[]; channels: Record<string, string>; base: string }) {
  const t = TEXT[useLocale()];
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [channel, setChannel] = useState("all");

  const pending = items.filter((n) => n.requiresAck && !n.acked);
  const featured = pending[0] ?? items[0];
  const others = items
    .filter((n) => n.id !== featured?.id)
    .filter((n) => !expanded || channel === "all" || n.channel === channel);
  const shown = expanded ? others : others.slice(0, 2);
  const featuredPending = featured && featured.requiresAck && !featured.acked;

  return (
    <section id="news" aria-label={t.region}>
      <div className="sec-header news-condensed-header">
        <div>
          <h3>
            {t.title} <span className="news-total">{t.count(items.length)}</span>
          </h3>
          <p>{t.lead}</p>
        </div>
        <div className="news-actions">
          {pending.length > 0 && (
            <Link href={`${base}/news/${pending[0].id}`} className="news-ack-shortcut" title={t.pending(pending.length)}>
              <Bell size={15} aria-hidden="true" />
              {pending.length}
            </Link>
          )}
          <button className="btn tiny" type="button" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? t.show : t.hide}
            {collapsed ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="news-condensed card">
          {featured ? (
            <div className="news-pinned">
              <span className="pin-icon" aria-hidden="true"><Megaphone size={20} strokeWidth={1.75} /></span>
              <div className="pin-body">
                <span className={`chip ${featuredPending ? "warn" : ""}`}>
                  {featuredPending ? (featured.edited ? t.editedAck : t.importantAck) : featured.requiresAck ? t.acked : t.latestNews}
                </span>
                <strong>{featured.title}</strong>
                <p>{featured.body}</p>
                <small>
                  {featured.date} · {channels[featured.channel] ?? featured.channel}
                </small>
              </div>
              <Link href={`${base}/news/${featured.id}`} className="btn primary tiny">
                {featuredPending ? t.readAck : t.read} <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="empty" style={{ margin: 16 }}>{t.empty}</div>
          )}

          {items.length > 1 && (
            <div className="news-compact-last">
              <div className="news-compact-caption">
                <strong>{t.latest}</strong>
                <button
                  type="button"
                  className="inline-link"
                  aria-expanded={expanded}
                  onClick={() => {
                    setExpanded(!expanded);
                    setChannel("all");
                  }}
                >
                  {expanded ? t.compact : t.all}
                  {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                </button>
              </div>
              {expanded && (
                <div className="filterbar">
                  {[["all", t.allChannels], ...Object.entries(channels)].map(([key, label]) => (
                    <button key={key} type="button" className={channel === key ? "active" : ""} onClick={() => setChannel(key)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="news-items-list">
                {shown.length ? (
                  shown.map((n) => {
                    const Icon = ICONS[n.channel] ?? Megaphone;
                    return (
                    <Link key={n.id} href={`${base}/news/${n.id}`} className="news-row">
                      <div className="news-ic"><Icon size={17} strokeWidth={1.75} aria-hidden="true" /></div>
                      <div className="news-row-copy">
                        <b>
                          {n.hasFiles && <Paperclip size={13} aria-label={t.hasFiles} style={{ marginRight: 4, verticalAlign: -2 }} />}
                          {n.title}
                        </b>
                        <small>
                          {channels[n.channel] ?? n.channel} · {n.date}
                        </small>
                      </div>
                      {n.requiresAck && !n.acked && <span className="chip warn">{n.edited ? t.editedWaiting : t.waiting}</span>}
                      <ChevronRight className="news-row-arrow" size={17} aria-hidden="true" />
                    </Link>
                    );
                  })
                ) : (
                  <div className="empty" style={{ gridColumn: "1/-1", margin: "10px 0" }}>{t.emptyChannel}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
