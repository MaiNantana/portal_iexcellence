"use client";

import { ArrowUpRight, Bell, CalendarDays, ChevronDown, ChevronRight, ChevronUp, Factory, Megaphone, Monitor, Paperclip, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { NewsItem } from "@/lib/portal";

const ICONS: Record<string, LucideIcon> = { hr: Users, it: Monitor, events: CalendarDays, production: Factory };

export function NewsPanel({ items, channels, base }: { items: NewsItem[]; channels: Record<string, string>; base: string }) {
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
    <section id="news" aria-label="ข่าวสารและประกาศบริษัท">
      <div className="sec-header news-condensed-header">
        <div>
          <h3>
            ข่าวสารและประกาศ <span className="news-total">{items.length} ข่าว</span>
          </h3>
          <p>ประกาศที่ต้องรับทราบอยู่ก่อน · ข่าวล่าสุดอยู่ในกล่องเดียวกัน</p>
        </div>
        <div className="news-actions">
          {pending.length > 0 && (
            <Link href={`${base}/news/${pending[0].id}`} className="news-ack-shortcut" title={`${pending.length} ประกาศที่ยังไม่รับทราบ`}>
              <Bell size={15} aria-hidden="true" />
              {pending.length}
            </Link>
          )}
          <button className="btn tiny" type="button" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "แสดงข่าวสาร" : "ยุบข่าวสาร"}
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
                  {featuredPending ? (featured.edited ? "มีการแก้ไข · ต้องรับทราบ" : "ประกาศสำคัญ · ต้องรับทราบ") : featured.requiresAck ? "รับทราบแล้ว" : "ข่าวสารล่าสุด"}
                </span>
                <strong>{featured.title}</strong>
                <p>{featured.body}</p>
                <small>
                  {featured.date} · {channels[featured.channel] ?? featured.channel}
                </small>
              </div>
              <Link href={`${base}/news/${featured.id}`} className="btn primary tiny">
                {featuredPending ? "อ่านและรับทราบ" : "อ่านประกาศ"} <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="empty" style={{ margin: 16 }}>ยังไม่มีข่าวสาร</div>
          )}

          {items.length > 1 && (
            <div className="news-compact-last">
              <div className="news-compact-caption">
                <strong>ข่าวล่าสุด</strong>
                <button
                  type="button"
                  className="inline-link"
                  aria-expanded={expanded}
                  onClick={() => {
                    setExpanded(!expanded);
                    setChannel("all");
                  }}
                >
                  {expanded ? "แสดงแบบย่อ" : "ดูข่าวทั้งหมด"}
                  {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                </button>
              </div>
              {expanded && (
                <div className="filterbar">
                  {[["all", "ทั้งหมด"], ...Object.entries(channels)].map(([key, label]) => (
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
                          {n.hasFiles && <Paperclip size={13} aria-label="มีไฟล์แนบ" style={{ marginRight: 4, verticalAlign: -2 }} />}
                          {n.title}
                        </b>
                        <small>
                          {channels[n.channel] ?? n.channel} · {n.date}
                        </small>
                      </div>
                      {n.requiresAck && !n.acked && <span className="chip warn">{n.edited ? "แก้ไขแล้ว · รอรับทราบ" : "รอรับทราบ"}</span>}
                      <ChevronRight className="news-row-arrow" size={17} aria-hidden="true" />
                    </Link>
                    );
                  })
                ) : (
                  <div className="empty" style={{ gridColumn: "1/-1", margin: "10px 0" }}>ไม่มีข่าวใน Channel นี้</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
