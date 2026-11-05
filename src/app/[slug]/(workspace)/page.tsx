import Link from "next/link";
import { Suspense } from "react";
import { NewsPanel } from "@/components/NewsPanel";
import { orgPath, requireMember, type Member } from "@/lib/context";
import { CHANNELS, getQuickEntries, getVisibleNews, pinnedEntries, toNewsItem } from "@/lib/portal";
import { getHrApprovals } from "@/lib/hr-work";
import { getMyWork, workCounts } from "@/lib/task";

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Bangkok" }).format(new Date()));
  if (hour < 12) return "สวัสดีตอนเช้า";
  if (hour < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

export default async function HomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await requireMember(slug);
  const base = orgPath(slug);
  const { org } = member;
  const [{ news, acked }, entries] = await Promise.all([getVisibleNews(member), getQuickEntries(member)]);
  const pinned = pinnedEntries(member, entries);
  const companyLinks = entries.filter((e) => e.kind === "company").length;
  const companyServices = entries.filter((e) => e.kind === "service");

  const services = [
    {
      name: "HR Excellence",
      desc: "ลงเวลา ขอลา และสลิปเงินเดือน",
      icon: "◷",
      style: "orange",
      url: org.hrEnabled && org.hrBaseUrl ? `${base}/go/hr` : null,
    },
    {
      name: "TaskExcellence",
      desc: "งาน แบบฟอร์ม Workflow และการอนุมัติ",
      icon: "☑",
      style: "blue",
      url: org.taskEnabled ? `${base}/go/task` : null,
    },
  ];

  return (
    <>
      <div className="intro">
        <div>
          <span className="eyebrow">Your company, in one place</span>
          <h2>{greeting()} 👋</h2>
          <p>ข่าวสารของบริษัทและบริการที่คุณใช้ประจำ อยู่ในหน้าเดียวกัน</p>
        </div>
      </div>

      <section className="quickrail card" aria-label="ทางลัดที่ปักหมุด">
        <div className="quickrail-intro">
          <span className="eyebrow">QUICK ACCESS</span>
          <strong>เข้าใช้งานทันที</strong>
          <small>ระบบและลิงก์ที่ใช้บ่อย</small>
        </div>
        <div className="quick-items">
          {pinned.length ? (
            pinned.map((e) => (
              <a key={e.key} className="quickitem" href={e.url} target="_blank" rel="noopener noreferrer" title={e.desc}>
                <span className={`quickicon ${e.kind}`}>{e.icon}</span>
                <span className="quicklabel">{e.name}</span>
              </a>
            ))
          ) : (
            <span className="quickempty">ยังไม่ปักหมุดบริการ · เลือกจากทางลัดได้</span>
          )}
        </div>
        <Link href={`${base}/launcher`} className="quick-more" title="จัดการทางลัด">
          ดูทั้งหมด <span>›</span>
        </Link>
      </section>

      {(org.taskEnabled || org.hrEnabled) && (
        <Suspense fallback={<WorkDashboard base={base} />}>
          <MyWorkDashboard member={member} base={base} />
        </Suspense>
      )}

      <NewsPanel items={news.map((n) => toNewsItem(n, acked))} channels={CHANNELS} base={base} />

      <section className="anchorzone" id="services">
        <div className="sec-header">
          <div>
            <h3>บริการของฉัน</h3>
            <p>เปิดระบบของบริษัทในแท็บใหม่ · ระบบที่ยังไม่ใช้ SSO อาจต้องเข้าสู่ระบบอีกครั้ง</p>
          </div>
          {member.role === "ADMIN" && (
            <Link href={`${base}/admin?tab=connections`} className="btn tiny">
              ⚙ เชื่อมต่อโปรแกรม
            </Link>
          )}
        </div>
        <div className="servicegrid">
          {services.map((s) => (
            <article key={s.name} className="service card">
              <div className="topline">
                <div className={`serviceicon ${s.style}`}>{s.icon}</div>
                <span className={`chip ${s.url ? "" : "gray"}`}>{s.url ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อม"}</span>
              </div>
              <div>
                <h4>{s.name}</h4>
                <p>{s.desc}</p>
              </div>
              <div className="servicebottom">
                <span className={`quiet ${s.url ? "svcactive" : ""}`}>
                  {s.url ? "พร้อมใช้" : member.role === "ADMIN" ? "ยังไม่ได้ตั้งค่า" : "ติดต่อ Admin"}
                </span>
                {s.url ? (
                  <a className="btn tiny light" href={s.url} target="_blank" rel="noopener noreferrer">
                    เปิด ↗
                  </a>
                ) : (
                  member.role === "ADMIN" && (
                    <Link className="btn tiny light" href={`${base}/admin?tab=connections`}>
                      ตั้งค่า ›
                    </Link>
                  )
                )}
              </div>
            </article>
          ))}
          {companyServices.map((s) => (
            <article key={s.key} className="service card">
              <div className="topline">
                <div className="serviceicon">{s.icon}</div>
                <span className="chip">บริการบริษัท</span>
              </div>
              <div>
                <h4>{s.name}</h4>
                <p>{s.desc}</p>
              </div>
              <div className="servicebottom">
                <span className="quiet svcactive">พร้อมใช้</span>
                <a className="btn tiny light" href={s.url} target="_blank" rel="noopener noreferrer">
                  เปิด ↗
                </a>
              </div>
            </article>
          ))}
          <article className="service card">
            <div className="topline">
              <div className="serviceicon violet">▦</div>
              <span className="chip">{companyLinks} ลิงก์</span>
            </div>
            <div>
              <h4>Company Apps</h4>
              <p>เว็บไซต์ ERP และระบบภายนอกที่บริษัทเพิ่มไว้</p>
            </div>
            <div className="servicebottom">
              <span className="quiet svcactive">พร้อมใช้</span>
              <Link className="btn tiny light" href={`${base}/launcher`}>
                เปิด ↗
              </Link>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}

/** "สิ่งที่ต้องดำเนินการ": counts from Task; each opens My Work on that list. Without counts it's the loading state. */
function WorkDashboard({ base, counts, failed }: { base: string; counts?: { open: number; overdue: number; approvals: number }; failed?: boolean }) {
  const items = [
    { tab: "tasks", label: "งานของฉัน", n: counts?.open, warn: false },
    { tab: "overdue", label: "งานเกินกำหนด", n: counts?.overdue, warn: true },
    { tab: "approvals", label: "งานรออนุมัติ", n: counts?.approvals, warn: false },
  ];
  return (
    <section className="card panel" aria-label="สิ่งที่ต้องดำเนินการ" style={{ marginBottom: 16 }}>
      <div className="sec-header">
        <div>
          <h3>สิ่งที่ต้องดำเนินการ</h3>
          <p>{failed ? "ติดต่อ TaskExcellence / HR ไม่ได้ในขณะนี้" : "งานและคำขอที่รอคุณอยู่ · กดเพื่อดูรายการและเปิดงานได้ทันที"}</p>
        </div>
        <Link href={`${base}/my-work`} className="btn tiny">
          ดูทั้งหมด ›
        </Link>
      </div>
      <div className="workstats">
        {items.map((i) => (
          <Link key={i.tab} href={`${base}/my-work?tab=${i.tab}`} className={`workstat ${i.warn && i.n ? "warn" : ""}`}>
            <span>
              {i.label}
              <small>{i.tab === "approvals" ? "HR ลา/OT · Task Workflow" : "มอบหมายให้ฉัน"}</small>
            </span>
            <b>{i.n ?? "…"}</b>
          </Link>
        ))}
      </div>
    </section>
  );
}

async function MyWorkDashboard({ member, base }: { member: Member; base: string }) {
  const [work, hr] = await Promise.all([getMyWork(member), getHrApprovals(member)]);
  if (!work && !hr) return member.org.taskEnabled ? <WorkDashboard base={base} failed /> : null;
  const counts = workCounts(work ?? { tasks: [], approvals: [] });
  counts.approvals += hr?.length ?? 0;
  return <WorkDashboard base={base} counts={counts} />;
}
