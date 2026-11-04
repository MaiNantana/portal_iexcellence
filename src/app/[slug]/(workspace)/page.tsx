import Link from "next/link";
import { NewsPanel } from "@/components/NewsPanel";
import { orgPath, requireMember } from "@/lib/context";
import { CHANNELS, getQuickEntries, getVisibleNews, pinnedEntries, toNewsItem } from "@/lib/portal";

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

  const services = [
    {
      name: "HR Excellence",
      desc: "ลงเวลา ขอลา และสลิปเงินเดือน",
      icon: "◷",
      style: "orange",
      url: org.hrEnabled ? org.hrBaseUrl : null,
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
          <article className="service card">
            <div className="topline">
              <div className="serviceicon">☑</div>
              <span className="chip gray">เร็ว ๆ นี้</span>
            </div>
            <div>
              <h4>งานของฉัน / รออนุมัติ</h4>
              <p>สรุปรายการจาก HR และ Task หลังเชื่อม SSO และ API</p>
            </div>
            <div className="servicebottom">
              <span className="quiet">Phase 3</span>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
