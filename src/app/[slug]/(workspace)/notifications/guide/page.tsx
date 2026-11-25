import Link from "next/link";
import { orgPath, requireMember } from "@/lib/context";
import { hubGroupsEnabled } from "@/lib/hub";
import { defineText, withLocale } from "@/i18n";
import { getLocale } from "@/i18n/server";

// Customer-facing setup guide for LINE / Telegram / Discord notifications (people set it up themselves).
// Groups: Discord channels always work (webhooks); LINE groups need the Hub's Admin API
// (HUB_ADMIN_URL / HUB_ADMIN_KEY), and the LINE steps say "coming soon" until those are set.
const groupsEnabled = () => hubGroupsEnabled();

type Section = { id: string; title: string; who?: string; soon?: boolean; intro?: string; steps: string[]; notes?: string[] };

const TEXT = defineText({
  th: {
    back: "‹ ช่องทางรับแจ้งเตือน",
    title: "คู่มือตั้งค่าการแจ้งเตือน",
    lead: "ตั้งค่าเองได้ทุกขั้นตอน ใช้เวลาประมาณ 1–2 นาทีต่อช่องทาง แจ้งเตือนทางอีเมลยังส่งเหมือนเดิมเสมอ",
    contents: "หัวข้อ",
    soon: "เร็ว ๆ นี้",
    openSettings: "ไปหน้าช่องทางรับแจ้งเตือน",
    sections: (): Section[] => [
      {
        id: "line",
        title: "1. รับแจ้งเตือนทาง LINE ส่วนตัว",
        who: "ทุกคน",
        steps: [
          "เข้า Portal แล้วเปิดเมนู ช่องทางรับแจ้งเตือน",
          "กดปุ่ม เชื่อม LINE ระบบจะแสดง QR code และรหัส (ใช้ได้ 15 นาที)",
          "ใช้มือถือสแกน QR code หรือกดลิงก์ เปิดลิงก์ LINE ถ้าเปิดบนมือถืออยู่แล้ว",
          "LINE จะเปิดหน้าเชื่อมบัญชีของ Iex.Notification กรอกอีเมลที่ใช้เข้า Portal แล้วกดยืนยัน",
          "เพิ่ม Iex.Notification เป็นเพื่อนถ้า LINE ถาม (ถ้าไม่เป็นเพื่อนหรือบล็อกไว้ จะไม่ได้รับข้อความ)",
          "กลับมาที่ Portal กด เชื่อมเสร็จแล้ว รีเฟรช สถานะจะเป็น เชื่อมแล้ว",
          "กด ส่งข้อความทดสอบถึงฉัน เพื่อเช็กว่าได้รับจริง",
        ],
        notes: ["ลิงก์ในข้อความ LINE จะเปิดในเบราว์เซอร์ของมือถือ (Safari / Chrome) ไม่ใช่ในแอป LINE เพื่อให้เข้าสู่ระบบค้างไว้ได้"],
      },
      {
        id: "telegram",
        title: "2. รับแจ้งเตือนทาง Telegram ส่วนตัว",
        who: "ทุกคน",
        steps: [
          "เปิดหน้า ช่องทางรับแจ้งเตือน แล้วกด เชื่อม Telegram",
          "สแกน QR code หรือกด เปิดลิงก์ Telegram",
          "ในแชทของบอท กด Start",
          "บอทจะถามอีเมล ตอบด้วยอีเมลที่ใช้เข้า Portal",
          "กลับมาที่ Portal กด เชื่อมเสร็จแล้ว รีเฟรช แล้วลอง ส่งข้อความทดสอบถึงฉัน",
        ],
        notes: [
          "ถ้าเชื่อมทั้ง LINE และ Telegram แจ้งเตือนจะส่งทาง ช่องทางหลัก ช่องเดียว เลือกได้ด้วยปุ่ม ใช้เป็นช่องทางหลัก ถ้าส่งไม่ถึง (เช่นบล็อกไว้) ระบบจะลองอีกช่องทาง",
        ],
      },
      {
        id: "discord",
        title: "3. รับแจ้งเตือนทาง Discord",
        who: "ทุกคน",
        steps: [
          "เปิดหน้า ช่องทางรับแจ้งเตือน แล้วกด เชื่อม Discord",
          "เข้าสู่ระบบ Discord แล้วกด Authorize",
          "ระบบจะพาเข้าเซิร์ฟเวอร์ Discord ของ iExcellence เพื่อให้บอทส่งข้อความส่วนตัว (DM) ถึงคุณได้",
          "ดูข้อความยืนยันใน DM ของ Discord",
        ],
        notes: ["Discord ส่งคู่กับ LINE / Telegram ได้ ไม่นับเป็นช่องทางหลัก"],
      },
      {
        id: "task",
        title: "4. ให้ Task ส่งแจ้งเตือนเข้า LINE / Telegram",
        who: "ทุกคน",
        intro: "หลังเชื่อมช่องทางแล้ว ต้องเปิดสวิตช์ใน Task อีกครั้งหนึ่ง",
        steps: [
          "เปิด Task (TaskExcellence) แล้วกดรูปโปรไฟล์ › My Account",
          "ไปที่แท็บ Notifications แล้วเปิดสวิตช์ส่งแจ้งเตือนทาง LINE / Telegram",
          "จากนี้อีเมลแจ้งเตือนของ Task (เช่น ถูก mention ได้รับมอบหมายงาน งานใกล้ครบกำหนด) จะส่งเข้า LINE / Telegram ด้วย",
        ],
        notes: [
          "เจ้าของบอร์ดตั้ง Automation ให้ส่ง LINE / Telegram ได้: ในคอลัมน์ Status กด Automation › Action เลือก Send LINE / Telegram to people in Person column แล้วใส่ข้อความได้ (ใช้ {title} {status} {column} {board} {actor}) ลิงก์ของงานจะต่อท้ายให้เอง",
          "Action ใน Automation ส่งถึงทุกคนใน Person column ที่เชื่อม LINE / Telegram ไว้ ไม่ต้องรอให้ผู้รับเปิดสวิตช์",
        ],
      },
      {
        id: "groups",
        title: "5. ส่งแจ้งเตือนเข้ากลุ่ม LINE / ช่อง Discord",
        who: "admin ของบริษัท",
        intro: "ให้แจ้งเตือนจาก Task เข้ากลุ่มแชทของทีม แทนหรือเพิ่มจากแชทส่วนตัว บริษัทหนึ่งเชื่อมได้หลายกลุ่ม ทั้ง LINE และ Discord",
        steps: [
          ...(groupsEnabled()
            ? [
                "กลุ่ม LINE: admin เปิดหน้า ช่องทางรับแจ้งเตือน › กลุ่มแจ้งเตือน แล้วกด + เชื่อมกลุ่ม LINE จะได้คำสั่ง /register พร้อมรหัส (ใช้ได้ 24 ชั่วโมง 1 รหัสต่อ 1 กลุ่ม)",
                "ในกลุ่ม LINE: กดชื่อกลุ่ม › เชิญ แล้วค้นหาและเชิญ Iex.Notification จากนั้นใครก็ได้ในกลุ่มพิมพ์คำสั่ง เช่น /register ABCD-2345 บอทจะตอบยืนยัน",
              ]
            : ["กลุ่ม LINE: เร็ว ๆ นี้"]),
          "ช่อง Discord: ใน Discord คลิกขวาที่ช่อง › Edit Channel › Integrations › Webhooks › New Webhook › Copy Webhook URL แล้วใน Portal กด + เพิ่มช่อง Discord วางลิงก์ ตั้งชื่อ แล้วกด เพิ่ม",
          "กลุ่มที่เชื่อมแล้วขึ้นในรายการ กลุ่มแจ้งเตือน กด ทดสอบ เพื่อลองส่งได้ ทำซ้ำเพื่อเพิ่มกลุ่มอื่น",
          "ใน Task ตั้ง Automation › Action เลือก Send to group แล้วเลือกกลุ่ม ใส่ข้อความเองได้เหมือนการส่งส่วนตัว",
        ],
        notes: [
          "LINE นับโควตาข้อความตามจำนวนสมาชิกในกลุ่ม: ส่งเข้ากลุ่ม 20 คน 1 ครั้ง = 20 ข้อความ ควรเลือกส่งเฉพาะเรื่องสำคัญ Discord ไม่มีโควตา",
          "Webhook URL ของ Discord ใครได้ไปก็โพสต์เข้าช่องได้ อย่าแชร์ Portal เก็บไว้แบบเข้ารหัส",
          "เลิกส่งเข้ากลุ่ม: กด ยกเลิก ที่กลุ่มนั้นใน Portal",
          "กลุ่ม Telegram: เร็ว ๆ นี้",
        ],
      },
      {
        id: "help",
        title: "6. ไม่ได้รับแจ้งเตือน ทำอย่างไร",
        steps: [
          "ดูหน้า ช่องทางรับแจ้งเตือน ว่าสถานะเป็น เชื่อมแล้ว ถ้าขึ้นว่าบล็อกอยู่ ให้ปลดบล็อก Iex.Notification ใน LINE หรือบอทใน Telegram",
          "กด ส่งข้อความทดสอบถึงฉัน ถ้าได้รับ แปลว่าช่องทางใช้ได้",
          "ถ้าเป็นแจ้งเตือนจาก Task เช็กว่าเปิดสวิตช์ใน Task › My Account › Notifications แล้ว",
          "อีเมลที่กรอกตอนเชื่อมต้องเป็นอีเมลเดียวกับที่ใช้เข้า Portal และ Task",
          "ยังไม่ได้รับอีก ให้กด ยกเลิก แล้วเชื่อมใหม่ หรือแจ้ง admin ของบริษัท",
        ],
      },
    ],
  },
  en: {
    back: "‹ Notification channels",
    title: "Notification setup guide",
    lead: "You can set everything up yourself, about 1–2 minutes per channel. Email notifications keep coming as before.",
    contents: "Contents",
    soon: "Coming soon",
    openSettings: "Open notification channels",
    sections: (): Section[] => [
      {
        id: "line",
        title: "1. Personal LINE notifications",
        who: "Everyone",
        steps: [
          "In the Portal, open Notification channels",
          "Press Connect LINE. A QR code and a code appear (valid 15 minutes)",
          "Scan the QR code with your phone, or tap open the LINE link if you're already on your phone",
          "LINE opens Iex.Notification's link page. Enter the email you use for the Portal and confirm",
          "Add Iex.Notification as a friend if LINE asks (blocked or not a friend = no messages)",
          "Back in the Portal press Done, refresh. The status becomes Connected",
          "Press Send me a test message to check",
        ],
        notes: ["Links in LINE messages open in your phone's browser (Safari / Chrome), not inside LINE, so you stay signed in"],
      },
      {
        id: "telegram",
        title: "2. Personal Telegram notifications",
        who: "Everyone",
        steps: [
          "Open Notification channels and press Connect Telegram",
          "Scan the QR code or tap open the Telegram link",
          "In the bot chat press Start",
          "The bot asks for your email: reply with the email you use for the Portal",
          "Back in the Portal press Done, refresh, then Send me a test message",
        ],
        notes: [
          "With both LINE and Telegram connected, notifications go to the main channel only (Make main channel). If it can't be reached (e.g. blocked), the other one is tried",
        ],
      },
      {
        id: "discord",
        title: "3. Discord notifications",
        who: "Everyone",
        steps: [
          "Open Notification channels and press Connect Discord",
          "Sign in to Discord and press Authorize",
          "You join the iExcellence Discord server so the bot can send you direct messages (DM)",
          "Check the confirmation in your Discord DMs",
        ],
        notes: ["Discord is sent in addition to LINE / Telegram; it isn't a main channel"],
      },
      {
        id: "task",
        title: "4. Task notifications on LINE / Telegram",
        who: "Everyone",
        intro: "After connecting a channel, turn it on in Task as well",
        steps: [
          "Open Task (TaskExcellence), click your profile › My Account",
          "Go to Notifications and turn on LINE / Telegram",
          "Task's notification emails (mentions, assignments, tasks coming due) now also go to LINE / Telegram",
        ],
        notes: [
          "Board owners can add an Automation: in a Status column › Automation › Action, choose Send LINE / Telegram to people in Person column and write a message ({title} {status} {column} {board} {actor}). The task link is added automatically",
          "Automation messages reach everyone in the Person column who connected LINE / Telegram, without the switch",
        ],
      },
      {
        id: "groups",
        title: "5. Notifications to LINE groups / Discord channels",
        who: "Company admins",
        intro: "Send Task notifications into your team's group chats, instead of or as well as personal chats. A company can connect any number of LINE groups and Discord channels",
        steps: [
          ...(groupsEnabled()
            ? [
                "LINE group: an admin opens Notification channels › Notification groups and presses + Connect a LINE group, which gives a /register command with a code (valid 24 hours, one code per group)",
                "In the LINE group: tap the group name › Invite, find and invite Iex.Notification. Then anyone in the group sends the command, e.g. /register ABCD-2345, and the bot confirms",
              ]
            : ["LINE groups: coming soon"]),
          "Discord channel: in Discord, right-click the channel › Edit Channel › Integrations › Webhooks › New Webhook › Copy Webhook URL. In the Portal press + Add a Discord channel, paste it, name it and press Add",
          "Connected groups appear under Notification groups; press Test to try one. Repeat to add more",
          "In Task, add an Automation › Action: Send to group, and pick the group",
        ],
        notes: [
          "LINE counts messages per group member: one message to a 20-person group = 20 messages of your quota. Use it for important updates. Discord has no quota",
          "Anyone with a Discord webhook URL can post into that channel, so don't share it. The Portal stores it encrypted",
          "To stop: press Disconnect on that group in the Portal",
          "Telegram groups: coming soon",
        ],
      },
      {
        id: "help",
        title: "6. Not getting notifications?",
        steps: [
          "On Notification channels the status should be Connected. If it says blocked, unblock Iex.Notification in LINE or the bot in Telegram",
          "Press Send me a test message. If it arrives, the channel works",
          "For Task notifications, check the switch in Task › My Account › Notifications",
          "The email you entered when connecting must be the one you use for the Portal and Task",
          "Still nothing: press Disconnect and connect again, or contact your company admin",
        ],
      },
    ],
  },
});

/** /<slug>/notifications/guide: how to set up LINE / Telegram / Discord (and group) notifications. */
export default async function NotificationGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = TEXT[locale];
  await requireMember(slug);
  const sections = t.sections();
  const settings = withLocale(locale, orgPath(slug, "/notifications"));

  return (
    <article className="card panel article" style={{ maxWidth: 760 }}>
      <Link href={settings} className="inline-link">
        {t.back}
      </Link>
      <h1>{t.title}</h1>
      <p className="body">{t.lead}</p>

      <nav className="guide-toc" aria-label={t.contents}>
        <b>{t.contents}</b>
        <ol>
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-link">
                {s.title.replace(/^\d+\.\s*/, "")}
              </a>
              {s.soon && <span className="chip warn">{t.soon}</span>}
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((s) => (
        <section key={s.id} id={s.id} className="guide-section">
          <h2>
            {s.title} {s.soon && <span className="chip warn">{t.soon}</span>}
          </h2>
          {s.who && <p className="guide-who">{s.who}</p>}
          {s.intro && <p className="body">{s.intro}</p>}
          <ol className="guide-steps">
            {s.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          {s.notes && s.notes.length > 0 && (
            <ul className="guide-notes">
              {s.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <div className="form-actions" style={{ marginTop: 24 }}>
        <Link href={settings} className="btn primary">
          {t.openSettings}
        </Link>
      </div>
    </article>
  );
}
