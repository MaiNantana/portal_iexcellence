import Link from "next/link";
import { listHrDatabases } from "@/app/hr-actions";
import { HrConnectForm } from "@/components/HrConnectForm";
import { HR_DEFAULT_ORIGIN } from "@/lib/hr";
import { createNews, createService, deleteLink, deleteNews, deleteService, removeMember, revokeInvitation, setMemberDepartment, setMemberRole, setSystemConnected, updateNews, createDepartment, deleteDepartment, renameDepartment } from "@/app/actions";
import {
  addDomain,
  decideJoinRequest,
  regenerateJoinCode,
  updateOrgProfile,
  removeDomain,
  setJoinMode,
  toggleDomainAutoJoin,
  verifyDomain,
} from "@/app/org-actions";
import { ActionForm } from "@/components/ActionForm";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { ConfirmButton } from "@/components/ConfirmButton";
import { InviteMembersForm } from "@/components/InviteMembersForm";
import type { News } from "@prisma/client";
import { MAX_NEWS_FILE_MB, MAX_NEWS_FILES, NEWS_FILE_ACCEPT, formatFileSize } from "@/lib/news-files";
import { orgPath, requireAdmin } from "@/lib/context";
import { db } from "@/lib/db";
import { SERVICE_ICONS, channelLabel, channelNames, domainTxtName, getDepartments, toBangkokInput } from "@/lib/portal";
import { getTaskProjects } from "@/lib/task";
import { defineText, formatDate, formatDateTime, withLocale, type Locale } from "@/i18n";
import { getLocale } from "@/i18n/server";

const TEXT = defineText({
  th: {
    tabs: { news: "ข่าวสาร", services: "บริการ", links: "ลิงก์บริษัท", connections: "เชื่อมต่อโปรแกรม", members: "สมาชิก", departments: "แผนก", access: "การเข้าร่วม" },
    title: (org: string) => `จัดการบริษัท · ${org}`,
    plan: (plan: string) => `แพ็กเกจ ${plan}`,
    delete: "ลบ",
    edit: "แก้ไข",
    save: "บันทึก",
    saveEdit: "บันทึกการแก้ไข",
    cancel: "ยกเลิก",
    // Access
    joinModes: {
      OFF: ["ปิด", "ไม่มีใครใช้ลิงก์เข้าร่วมได้"],
      APPROVAL: ["ต้องอนุมัติ", "คนที่กดลิงก์จะส่งคำขอ แล้ว Admin อนุมัติในแท็บสมาชิก"],
      OPEN: ["เข้าได้ทันที", "ใครมีลิงก์ก็เข้าเป็น Employee ได้เลย เหมาะกับการแชร์ในกลุ่มปิด"],
    },
    companyInfo: "ข้อมูลบริษัท",
    companyInfoLead: (slug: string) => `รหัสบริษัทใช้ใน URL ของ Portal เช่น /${slug} · ถ้าเปลี่ยน ลิงก์เดิมที่พนักงาน bookmark ไว้จะใช้ไม่ได้`,
    saveCompany: "บันทึกข้อมูลบริษัท",
    companyName: "ชื่อบริษัท",
    companyCode: "รหัสบริษัท (URL)",
    joinLink: "ลิงก์เข้าร่วม",
    joinLinkLead: "แชร์ในกลุ่ม LINE หรืออีเมล เหมาะกับพนักงานที่ใช้อีเมลส่วนตัว",
    companyLink: "ลิงก์ของบริษัท",
    newLinkTitle: "ลิงก์เดิมจะใช้ไม่ได้ทันที",
    newLinkConfirm: "สร้างลิงก์เข้าร่วมใหม่? ลิงก์เดิมที่แชร์ไปแล้วจะใช้ไม่ได้ทันที",
    newLink: "สร้างลิงก์ใหม่ (ยกเลิกลิงก์เดิม)",
    domains: "โดเมนอีเมลบริษัท",
    domainsLead: "ใครที่เข้าสู่ระบบด้วยอีเมลที่ยืนยันแล้วในโดเมนนี้ จะเข้าบริษัทเป็น Employee อัตโนมัติ · ใช้ gmail.com หรือโดเมนสาธารณะไม่ได้",
    addDomain: "เพิ่มโดเมน",
    domain: "โดเมน",
    verified: "ยืนยันแล้ว",
    pending: "รอยืนยัน",
    autoJoinOff: "ปิดการเข้าอัตโนมัติ",
    autoJoinOn: "เปิดการเข้าอัตโนมัติ",
    autoJoinIsOn: "เข้าอัตโนมัติ: เปิด",
    autoJoinIsOff: "เข้าอัตโนมัติ: ปิด",
    txtHelp: "เพิ่ม TXT record ที่ผู้ให้บริการ DNS ของโดเมน แล้วกดตรวจสอบ",
    txtHost: "ชื่อ (Host):",
    txtValue: "ค่า (Value):",
    checkDns: "ตรวจสอบ DNS",
    deleteDomainConfirm: (d: string) => `ลบโดเมน @${d}? คนที่ใช้อีเมลโดเมนนี้จะไม่เข้าบริษัทอัตโนมัติอีกต่อไป`,
    deleteDomain: "ลบโดเมน",
    // News
    newsTitle: "หัวข้อข่าว",
    newsTitlePlaceholder: "เช่น แจ้งกำหนดการประชุมประจำเดือน",
    body: "เนื้อหา",
    audience: "กลุ่มผู้รับ",
    allStaff: "พนักงานทั้งหมด",
    onlyDept: (name: string) => `${name} เท่านั้น`,
    publishAt: "ตั้งเวลาเผยแพร่ (เว้นว่าง = ทันที)",
    expiresAt: "วันหมดอายุ (เว้นว่าง = ไม่หมดอายุ)",
    files: (max: number, mb: number) => `แนบไฟล์หรือรูปภาพ (สูงสุด ${max} ไฟล์ ไฟล์ละไม่เกิน ${mb} MB)`,
    removeFile: "ลบไฟล์",
    requiresAck: "ต้องกดรับทราบ",
    notifyEdit: "แจ้งทางอีเมลว่ามีการแก้ไข (เมื่อแก้เนื้อหาหรือไฟล์)",
    notifyPublish: "แจ้งผู้รับทางอีเมลเมื่อเผยแพร่",
    scheduledAt: (d: string) => `ตั้งเวลา ${d}`,
    expired: "หมดอายุแล้ว",
    editNews: "แก้ไขประกาศ",
    editAckWarning: (n: number) => `ถ้าแก้หัวข้อ เนื้อหา หรือไฟล์แนบ การรับทราบเดิม${n > 0 ? ` ${n} คน` : ""}จะถูกล้าง และทุกคนต้องกดรับทราบอีกครั้ง`,
    createNews: "สร้างข่าวสาร",
    publish: "เผยแพร่",
    publishedNews: "ข่าวที่เผยแพร่",
    noNews: "ยังไม่มีข่าว",
    recipients: (who: string) => `ผู้รับ: ${who}`,
    everyone: "ทั้งหมด",
    editedOn: (d: string) => ` · แก้ไข ${d}`,
    expiresOn: (d: string) => ` · หมดอายุ ${d}`,
    attachments: (n: number) => ` · ไฟล์แนบ ${n}`,
    ackCount: (done: number, all: number) => ` · รับทราบ ${done}/${all}`,
    deleteNewsConfirm: (title: string) => `ลบประกาศ "${title}"? ประวัติการรับทราบและไฟล์แนบจะหายไปด้วย และกู้คืนไม่ได้`,
    waitingSummary: (n: number) => `ยังไม่รับทราบ ${n} คน · ดูรายชื่อ`,
    waiting: (n: number) => `ยังไม่รับทราบ (${n})`,
    allAcked: "รับทราบครบทุกคนแล้ว",
    acked: (n: number) => `รับทราบแล้ว (${n})`,
    noneAcked: "ยังไม่มีใครรับทราบ",
    // Departments
    departmentsTitle: (n: number) => `แผนกของบริษัท (${n})`,
    departmentsLead: "ใช้เลือกกลุ่มผู้รับข่าวสารและผู้ใช้บริการ · กำหนดแผนกให้สมาชิกได้ที่แท็บสมาชิก",
    noDepartments: "ยังไม่มีแผนก",
    deptMembers: (n: number) => `สมาชิก ${n} คน`,
    deptUsed: (n: number) => ` · ใช้กับข่าวสารหรือบริการ ${n} รายการ (ลบไม่ได้จนกว่าจะเปลี่ยนกลุ่มผู้รับ)`,
    deleteDeptConfirm: (name: string, people: number) => `ลบแผนก ${name}?${people ? ` สมาชิก ${people} คนจะกลายเป็น "ไม่ระบุแผนก"` : ""}`,
    renameDept: "แก้ไขชื่อแผนก",
    deptName: "ชื่อแผนก",
    addDept: "เพิ่มแผนก",
    deptPlaceholder: "เช่น ฝ่ายบัญชี",
    // Services
    servicesNeedTask: "บริการของบริษัท (เช่น แจ้งซ่อม ใบเสนอราคา) ทำงานบน TaskExcellence ·",
    connectTaskFirst: "เชื่อมต่อ Task ก่อน",
    companyServices: "บริการของบริษัท",
    servicesLead: "พนักงานเห็นในเมนูลัด กดแล้วเข้า Project ใน Task ที่ผูกไว้ทันที โดยไม่ต้องค้นหาเอง",
    noServices: "ยังไม่มีบริการ",
    everyoneChip: "ทุกคน",
    opensForm: "เปิดฟอร์มแจ้งใหม่",
    opensBoard: "เปิดตารางงาน",
    deleteServiceConfirm: (name: string) => `ลบบริการ ${name}? งานใน Task จะไม่ถูกลบ แต่พนักงานจะไม่เห็นบริการนี้ใน Portal`,
    addService: "เพิ่มบริการ",
    taskUnreachable: "ติดต่อ TaskExcellence ไม่ได้ ลองใหม่อีกครั้ง",
    noProjects: (email: string) => `ยังไม่มี Project ใน Task ที่บัญชีคุณ (${email}) เห็น · สร้าง Project (เช่นจาก Template แจ้งซ่อม หรือ Accounting) ใน Task ก่อน`,
    serviceName: "ชื่อบริการ",
    serviceNamePlaceholder: "เช่น แจ้งซ่อม",
    description: "คำอธิบาย",
    descriptionPlaceholder: "เช่น บริการแจ้งซ่อมบำรุง",
    icon: "ไอคอน",
    project: "Project ใน TaskExcellence",
    pickProject: "เลือก Project",
    onOpen: "เมื่อกดบริการ",
    openBoard: "เปิดตารางงานของ Project",
    openForm: "เปิดฟอร์มสร้างงานใหม่ (เช่น + แจ้งซ่อมใหม่)",
    whoCanUse: "ใครใช้ได้",
    everyoneInCompany: "ทุกคนในบริษัท",
    taskRightsNote: "สิทธิ์ใน Task ยังมีผลเหมือนเดิม · พนักงานต้องเป็นสมาชิก Project นั้นใน Task จึงจะเปิดได้",
    // Links
    linksNoteA: "ลิงก์บริษัทจะแสดงให้พนักงานทุกคน · เพิ่มลิงก์ใหม่ได้จากหน้า",
    shortcuts: "ทางลัด",
    linksNoteB: "โดยเลือก “ทุกคนในบริษัท”",
    noCompanyLinks: "ยังไม่มีลิงก์บริษัท",
    deleteLinkConfirm: (name: string) => `ลบลิงก์ ${name}? พนักงานทุกคนจะไม่เห็นลิงก์นี้อีก`,
    // Connections
    connected: "เชื่อมต่อแล้ว",
    notConnected: "ยังไม่เชื่อม",
    disconnectConfirm: (name: string) => `ตัดการเชื่อมต่อ ${name}? พนักงานจะเปิดระบบนี้จาก Portal ไม่ได้จนกว่าจะเชื่อมต่อใหม่`,
    disconnect: "ตัดการเชื่อมต่อ",
    taskNote: "พนักงานกดจาก Portal แล้วเข้า Task ได้ทันทีโดยไม่ต้อง login ซ้ำ (จับคู่ด้วยอีเมล ถ้ายังไม่มีบัญชี Task จะสร้างให้)",
    connect: "เชื่อมต่อ",
    hrDesc: "ลงเวลา ขอลา และสลิปเงินเดือน",
    // Members
    joinRequests: (n: number) => `คำขอเข้าร่วม (${n})`,
    requestedOn: (d: string) => `ขอเมื่อ ${d}`,
    approve: "อนุมัติ",
    reject: "ปฏิเสธ",
    rejectConfirm: (who: string) => `ปฏิเสธคำขอเข้าร่วมของ ${who}?`,
    members: (n: number) => `สมาชิก (${n})`,
    adminNote: "บทบาท Admin ใน Portal ไม่ได้ให้สิทธิ์อนุมัติใน HR/Task",
    you: "คุณ",
    lastLogin: (d: string) => `เข้าใช้ล่าสุด ${d}`,
    neverLoggedIn: "ยังไม่เคยเข้าใช้",
    deptOf: (who: string) => `แผนกของ ${who}`,
    noDept: "ไม่ระบุแผนก",
    makeEmployee: "ลดเป็น Employee",
    makeAdmin: "ตั้งเป็น Admin",
    remove: "นำออก",
    removeConfirm: (who: string) => `นำ ${who} ออกจากบริษัท? คำเชิญและการเชื่อมบัญชี HR/Task ของคนนี้จะถูกลบด้วย`,
    invite: "เชิญสมาชิก",
    inviteLead: "เชิญได้หลายคนพร้อมกัน ผู้รับเชิญเข้าสู่ระบบด้วย Google / Microsoft ของอีเมลนั้น หรือตั้งรหัสผ่านผ่านรหัสทางอีเมล",
    pendingInvites: (n: number) => `รอตอบรับ (${n})`,
    invitedBy: (who: string) => `เชิญโดย ${who}`,
    revokeConfirm: (email: string) => `ยกเลิกคำเชิญของ ${email}?`,
  },
  en: {
    tabs: { news: "News", services: "Services", links: "Company links", connections: "Connected apps", members: "Members", departments: "Departments", access: "Joining" },
    title: (org: string) => `Manage company · ${org}`,
    plan: (plan: string) => `${plan} plan`,
    delete: "Delete",
    edit: "Edit",
    save: "Save",
    saveEdit: "Save changes",
    cancel: "Cancel",
    joinModes: {
      OFF: ["Off", "No one can use the join link"],
      APPROVAL: ["Needs approval", "People who open the link send a request; an Admin approves it in Members"],
      OPEN: ["Join right away", "Anyone with the link joins as an Employee. Best for sharing in closed groups"],
    },
    companyInfo: "Company details",
    companyInfoLead: (slug: string) => `The company code is used in Portal URLs, e.g. /${slug} · if you change it, bookmarks to the old address stop working`,
    saveCompany: "Save company details",
    companyName: "Company name",
    companyCode: "Company code (URL)",
    joinLink: "Join link",
    joinLinkLead: "Share it in a LINE group or by email. Good for staff who use personal email addresses.",
    companyLink: "Your company's link",
    newLinkTitle: "The old link stops working immediately",
    newLinkConfirm: "Create a new join link? The link you already shared stops working immediately.",
    newLink: "New link (cancel the old one)",
    domains: "Company email domains",
    domainsLead: "Anyone who signs in with a verified email on this domain joins as an Employee automatically · gmail.com and other public domains can't be used",
    addDomain: "Add domain",
    domain: "Domain",
    verified: "Verified",
    pending: "Not verified",
    autoJoinOff: "Turn off auto-join",
    autoJoinOn: "Turn on auto-join",
    autoJoinIsOn: "Auto-join: on",
    autoJoinIsOff: "Auto-join: off",
    txtHelp: "Add a TXT record at the domain's DNS provider, then press Check",
    txtHost: "Name (Host):",
    txtValue: "Value:",
    checkDns: "Check DNS",
    deleteDomainConfirm: (d: string) => `Delete the domain @${d}? People with this email domain will no longer join automatically.`,
    deleteDomain: "Delete domain",
    newsTitle: "Title",
    newsTitlePlaceholder: "e.g. Monthly meeting schedule",
    body: "Body",
    audience: "Audience",
    allStaff: "All staff",
    onlyDept: (name: string) => `${name} only`,
    publishAt: "Publish at (blank = now)",
    expiresAt: "Expires at (blank = never)",
    files: (max: number, mb: number) => `Attach files or images (up to ${max} files, ${mb} MB each)`,
    removeFile: "Remove",
    requiresAck: "Must be acknowledged",
    notifyEdit: "Email the audience about the edit (when the text or files change)",
    notifyPublish: "Email the audience when it's published",
    scheduledAt: (d: string) => `Scheduled ${d}`,
    expired: "Expired",
    editNews: "Edit announcement",
    editAckWarning: (n: number) => `Changing the title, body or attachments clears the ${n > 0 ? `${n} ` : ""}existing acknowledgement${n === 1 ? "" : "s"}, and everyone must acknowledge again`,
    createNews: "New post",
    publish: "Publish",
    publishedNews: "Published posts",
    noNews: "No posts yet",
    recipients: (who: string) => `to: ${who}`,
    everyone: "everyone",
    editedOn: (d: string) => ` · edited ${d}`,
    expiresOn: (d: string) => ` · expires ${d}`,
    attachments: (n: number) => ` · ${n} attachment${n === 1 ? "" : "s"}`,
    ackCount: (done: number, all: number) => ` · acknowledged ${done}/${all}`,
    deleteNewsConfirm: (title: string) => `Delete "${title}"? Its acknowledgements and attachments go too, and it can't be undone.`,
    waitingSummary: (n: number) => `${n} not acknowledged yet · see who`,
    waiting: (n: number) => `Not acknowledged (${n})`,
    allAcked: "Everyone has acknowledged",
    acked: (n: number) => `Acknowledged (${n})`,
    noneAcked: "No one has acknowledged yet",
    departmentsTitle: (n: number) => `Departments (${n})`,
    departmentsLead: "Used to choose who sees news and services · assign members to departments in Members",
    noDepartments: "No departments yet",
    deptMembers: (n: number) => `${n} member${n === 1 ? "" : "s"}`,
    deptUsed: (n: number) => ` · used by ${n} post${n === 1 ? "" : "s"} or service${n === 1 ? "" : "s"} (can't be deleted until their audience changes)`,
    deleteDeptConfirm: (name: string, people: number) => `Delete the department ${name}?${people ? ` ${people} member${people === 1 ? "" : "s"} will have no department.` : ""}`,
    renameDept: "Rename department",
    deptName: "Department name",
    addDept: "Add department",
    deptPlaceholder: "e.g. Accounting",
    servicesNeedTask: "Company services (such as repair requests or quotations) run on TaskExcellence ·",
    connectTaskFirst: "connect Task first",
    companyServices: "Company services",
    servicesLead: "Staff see these in their shortcuts and go straight to the linked Task project, without searching",
    noServices: "No services yet",
    everyoneChip: "Everyone",
    opensForm: "opens the new-request form",
    opensBoard: "opens the task board",
    deleteServiceConfirm: (name: string) => `Delete the service ${name}? Tasks in Task are kept, but staff won't see this service in the Portal.`,
    addService: "Add service",
    taskUnreachable: "Can't reach TaskExcellence. Please try again.",
    noProjects: (email: string) => `Your account (${email}) can't see any Task projects yet · create one in Task first (e.g. from the Repair or Accounting template)`,
    serviceName: "Service name",
    serviceNamePlaceholder: "e.g. Repair request",
    description: "Description",
    descriptionPlaceholder: "e.g. Report something that needs fixing",
    icon: "Icon",
    project: "TaskExcellence project",
    pickProject: "Choose a project",
    onOpen: "When opened",
    openBoard: "Open the project's task board",
    openForm: "Open the new-task form (e.g. + New repair request)",
    whoCanUse: "Who can use it",
    everyoneInCompany: "Everyone in the company",
    taskRightsNote: "Task permissions still apply · staff must be members of that Task project to open it",
    linksNoteA: "Company links are shown to all staff · add a new one from",
    shortcuts: "Shortcuts",
    linksNoteB: "and choose “Everyone in the company”",
    noCompanyLinks: "No company links yet",
    deleteLinkConfirm: (name: string) => `Delete the link ${name}? No one in the company will see it any more.`,
    connected: "Connected",
    notConnected: "Not connected",
    disconnectConfirm: (name: string) => `Disconnect ${name}? Staff can't open it from the Portal until it's connected again.`,
    disconnect: "Disconnect",
    taskNote: "Staff open Task from the Portal without signing in again (matched by email; a Task account is created if needed)",
    connect: "Connect",
    hrDesc: "Time attendance, leave requests and payslips",
    joinRequests: (n: number) => `Join requests (${n})`,
    requestedOn: (d: string) => `requested ${d}`,
    approve: "Approve",
    reject: "Decline",
    rejectConfirm: (who: string) => `Decline the join request from ${who}?`,
    members: (n: number) => `Members (${n})`,
    adminNote: "The Portal's Admin role doesn't give approval rights in HR/Task",
    you: "You",
    lastLogin: (d: string) => `Last signed in ${d}`,
    neverLoggedIn: "Never signed in",
    deptOf: (who: string) => `Department of ${who}`,
    noDept: "No department",
    makeEmployee: "Make Employee",
    makeAdmin: "Make Admin",
    remove: "Remove",
    removeConfirm: (who: string) => `Remove ${who} from the company? Their invitation and HR/Task account links are deleted too.`,
    invite: "Invite members",
    inviteLead: "Invite several people at once. They sign in with the Google / Microsoft account for that email, or set a password with an email code.",
    pendingInvites: (n: number) => `Waiting to accept (${n})`,
    invitedBy: (who: string) => `invited by ${who}`,
    revokeConfirm: (email: string) => `Cancel the invitation for ${email}?`,
  },
});

type T = (typeof TEXT)["th"];
const TABS = ["news", "services", "links", "connections", "members", "departments", "access"] as const;
const JOIN_MODES = ["OFF", "APPROVAL", "OPEN"] as const;

export default async function AdminPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const { slug } = await params;
  const admin = await requireAdmin(slug);
  const locale = await getLocale();
  const t = TEXT[locale];
  const base = withLocale(locale, orgPath(slug));
  const { tab: rawTab, edit } = await searchParams;
  const tab = TABS.find((k) => k === rawTab) ?? "news";
  const ctx = { slug, base, t, locale };

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Admin Console</span>
          <h2>{t.title(admin.org.name)}</h2>
        </div>
        <span className="chip gray">{t.plan(admin.org.plan)}</span>
      </div>
      <nav className="adminmenu">
        {TABS.map((k) => (
          <Link key={k} href={`${base}/admin?tab=${k}`} className={tab === k ? "on" : ""}>
            {t.tabs[k]}
          </Link>
        ))}
      </nav>
      {tab === "news" && <NewsTab {...ctx} orgId={admin.orgId} editId={edit} />}
      {tab === "services" && <ServicesTab {...ctx} admin={admin} />}
      {tab === "links" && <LinksTab {...ctx} orgId={admin.orgId} />}
      {tab === "connections" && <ConnectionsTab {...ctx} org={admin.org} />}
      {tab === "members" && <MembersTab {...ctx} orgId={admin.orgId} selfId={admin.id} hrEnabled={Boolean(admin.org.hrEnabled && admin.org.hrBaseUrl)} />}
      {tab === "departments" && <DepartmentsTab {...ctx} orgId={admin.orgId} editKey={edit} />}
      {tab === "access" && <AccessTab {...ctx} org={admin.org} />}
    </>
  );
}

type Ctx = { slug: string; base: string; t: T; locale: Locale };

async function AccessTab({ slug, base, t, org }: Ctx & { org: { id: string; name: string; joinCode: string | null; joinMode: string } }) {
  const domains = await db.orgDomain.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
  const link = org.joinCode ? `${process.env.AUTH_URL ?? "http://localhost:3000"}${base}/join/${org.joinCode}` : null;

  return (
    <div className="two-col">
      <section className="card panel">
        <h3>{t.companyInfo}</h3>
        <p className="low">{t.companyInfoLead(slug)}</p>
        <ActionForm org={slug} action={updateOrgProfile} submitLabel={t.saveCompany} resetOnSuccess={false}>
          <div className="field">
            <label htmlFor="org-name">{t.companyName}</label>
            <input id="org-name" name="name" required minLength={2} maxLength={100} defaultValue={org.name} />
          </div>
          <div className="field">
            <label htmlFor="org-slug">{t.companyCode}</label>
            <input id="org-slug" name="slug" required autoCapitalize="none" autoComplete="off" spellCheck={false} defaultValue={slug} />
          </div>
        </ActionForm>
        <div style={{ height: 18 }} />
        <h3>{t.joinLink}</h3>
        <p className="low">{t.joinLinkLead}</p>
        <form action={setJoinMode.bind(null, slug)}>
          {JOIN_MODES.map((value) => (
            <label key={value} className="adcard" style={{ cursor: "pointer", justifyContent: "flex-start" }}>
              <input type="radio" name="mode" value={value} defaultChecked={org.joinMode === value} />
              <div>
                <b>{t.joinModes[value][0]}</b>
                <small>{t.joinModes[value][1]}</small>
              </div>
            </label>
          ))}
          <div className="form-actions">
            <button className="btn primary">{t.save}</button>
          </div>
        </form>
        {link && org.joinMode !== "OFF" && (
          <>
            <div className="field">
              <label htmlFor="joinlink">{t.companyLink}</label>
              <input id="joinlink" readOnly value={link} />
            </div>
            <form action={regenerateJoinCode.bind(null, slug)}>
              <ConfirmButton className="btn tiny danger" title={t.newLinkTitle} message={t.newLinkConfirm}>{t.newLink}</ConfirmButton>
            </form>
          </>
        )}
      </section>

      <section className="card panel">
        <h3>{t.domains}</h3>
        <p className="low">{t.domainsLead}</p>
        <ActionForm org={slug} action={addDomain} submitLabel={t.addDomain}>
          <div className="field">
            <label htmlFor="domain">{t.domain}</label>
            <input id="domain" name="domain" required placeholder="abc.co.th" />
          </div>
        </ActionForm>
        {domains.map((d) => (
          <div className="adcard" key={d.id} style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <b style={{ fontSize: 13 }}>@{d.domain}</b>
              <span className={`chip ${d.verifiedAt ? "" : "warn"}`}>{d.verifiedAt ? t.verified : t.pending}</span>
            </div>
            {d.verifiedAt ? (
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <form action={toggleDomainAutoJoin.bind(null, slug, d.id)}>
                  <button className="btn tiny">{d.autoJoin ? t.autoJoinOff : t.autoJoinOn}</button>
                </form>
                <span className="low" style={{ alignSelf: "center" }}>{d.autoJoin ? t.autoJoinIsOn : t.autoJoinIsOff}</span>
              </div>
            ) : (
              <>
                <small>{t.txtHelp}</small>
                <div className="notice" style={{ marginTop: 8, wordBreak: "break-all" }}>
                  {t.txtHost} <b>{domainTxtName(d.domain)}</b>
                  <br />
                  {t.txtValue} <b>{d.verifyToken}</b>
                </div>
                <ActionForm org={slug} action={verifyDomain} submitLabel={t.checkDns} resetOnSuccess={false}>
                  <input type="hidden" name="id" value={d.id} />
                </ActionForm>
              </>
            )}
            <form action={removeDomain.bind(null, slug, d.id)} style={{ marginTop: 6 }}>
              <ConfirmButton className="inline-link" style={{ color: "var(--red)" }} confirmLabel={t.delete} message={t.deleteDomainConfirm(d.domain)}>{t.deleteDomain}</ConfirmButton>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}

type NewsWithFiles = News & { attachments: { id: string; name: string; size: number }[] };

/** Shared by the create and edit forms; `news` fills in the current values when editing. */
function NewsFields({ news, departments, base, t, locale }: { news?: NewsWithFiles; departments: Record<string, string>; base: string; t: T; locale: Locale }) {
  const scheduled = !news || news.publishedAt > new Date();
  return (
    <>
      <div className="field">
        <label htmlFor="title">{t.newsTitle}</label>
        <input id="title" name="title" required maxLength={200} defaultValue={news?.title} placeholder={t.newsTitlePlaceholder} />
      </div>
      <div className="field">
        <label htmlFor="body">{t.body}</label>
        <textarea id="body" name="body" required defaultValue={news?.body} />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="channel">Channel</label>
          <select id="channel" name="channel" defaultValue={news?.channel}>
            {Object.entries(channelNames(locale)).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="audience">{t.audience}</label>
          <select id="audience" name="audience" defaultValue={news?.audience ?? "all"}>
            <option value="all">{t.allStaff}</option>
            {Object.entries(departments).map(([k, v]) => (
              <option key={k} value={k}>{t.onlyDept(v)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        {scheduled && (
          <div className="field">
            <label htmlFor="publishAt">{t.publishAt}</label>
            <input id="publishAt" name="publishAt" type="datetime-local" defaultValue={news ? toBangkokInput(news.publishedAt) : ""} />
          </div>
        )}
        <div className="field">
          <label htmlFor="expiresAt">{t.expiresAt}</label>
          <input id="expiresAt" name="expiresAt" type="datetime-local" defaultValue={toBangkokInput(news?.expiresAt)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="files">{t.files(MAX_NEWS_FILES, MAX_NEWS_FILE_MB)}</label>
        <input id="files" name="files" type="file" multiple accept={NEWS_FILE_ACCEPT} />
      </div>
      {news?.attachments.map((a) => (
        <label className="checkline" key={a.id}>
          <input type="checkbox" name="removeFile" value={a.id} /> {t.removeFile}{" "}
          <a className="inline-link" href={`${base}/news-file/${a.id}`} target="_blank" rel="noopener noreferrer">{a.name}</a>
          <span className="muted">{formatFileSize(a.size)}</span>
        </label>
      ))}
      <label className="checkline">
        <input type="checkbox" name="requiresAck" defaultChecked={news?.requiresAck} /> {t.requiresAck}
      </label>
      <label className="checkline">
        <input type="checkbox" name="notifyEmail" defaultChecked /> {news && !scheduled ? t.notifyEdit : t.notifyPublish}
      </label>
    </>
  );
}

function NewsStatus({ news, now, t, locale }: { news: News; now: Date; t: T; locale: Locale }) {
  if (news.publishedAt > now) return <span className="chip blue">{t.scheduledAt(formatDateTime(news.publishedAt, locale))}</span>;
  if (news.expiresAt && news.expiresAt <= now) return <span className="chip gray">{t.expired}</span>;
  return null;
}

function AckPeople({ people, empty }: { people: { key: string; name: string; note?: string }[]; empty: string }) {
  if (!people.length) return <p className="low">{empty}</p>;
  return (
    <ul>
      {people.map((p) => (
        <li key={p.key}>
          {p.name}
          {p.note && <small> · {p.note}</small>}
        </li>
      ))}
    </ul>
  );
}

async function NewsTab({ slug, base, t, locale, orgId, editId }: Ctx & { orgId: string; editId?: string }) {
  const [news, members, departments] = await Promise.all([
    db.news.findMany({
      where: { orgId },
      orderBy: { publishedAt: "desc" },
      include: { acks: { select: { userId: true, ackedAt: true } }, attachments: { select: { id: true, name: true, size: true } } },
    }),
    db.membership.findMany({ where: { orgId }, select: { userId: true, department: true, user: { select: { name: true, email: true } } } }),
    getDepartments(orgId),
  ]);
  const editing = news.find((n) => n.id === editId);
  const now = new Date();
  const fields = { departments, base, t, locale };

  return (
    <div className="two-col">
      {editing ? (
        <section className="card panel">
          <h3>{t.editNews}</h3>
          {editing.requiresAck && editing.publishedAt <= now && (
            <div className="notice" style={{ marginTop: 12 }}>
              {t.editAckWarning(editing.acks.length)}
            </div>
          )}
          <ActionForm key={editing.id} org={slug} action={updateNews} submitLabel={t.saveEdit} resetOnSuccess={false} cancelHref={`${base}/admin?tab=news`}>
            <input type="hidden" name="id" value={editing.id} />
            <NewsFields news={editing} {...fields} />
          </ActionForm>
        </section>
      ) : (
        <section className="card panel">
          <h3>{t.createNews}</h3>
          <ActionForm org={slug} action={createNews} submitLabel={t.publish}>
            <NewsFields {...fields} />
          </ActionForm>
        </section>
      )}
      <section className="card panel">
        <h3>{t.publishedNews}</h3>
        {news.length === 0 && <div className="empty" style={{ marginTop: 12 }}>{t.noNews}</div>}
        {news.map((n) => {
          const audience = members.filter((m) => n.audience === "all" || m.department === n.audience);
          const acked = new Map(n.acks.map((a) => [a.userId, a.ackedAt]));
          const person = (m: (typeof audience)[number]) => ({ key: m.userId, name: m.user.name ?? m.user.email, note: m.department ? departments[m.department] : undefined });
          const waiting = audience.filter((m) => !acked.has(m.userId));
          const done = audience.filter((m) => acked.has(m.userId));
          return (
            <div className="adcard stack" key={n.id} style={editing?.id === n.id ? { borderColor: "var(--brand)" } : undefined}>
              <div className="adcard-top">
                <div style={{ minWidth: 0 }}>
                  <b>{n.title}</b> <NewsStatus news={n} now={now} t={t} locale={locale} />
                  <small>
                    {channelLabel(n.channel, locale)} · {formatDateTime(n.publishedAt, locale)} · {t.recipients(n.audience === "all" ? t.everyone : departments[n.audience] ?? n.audience)}
                    {n.editedAt && t.editedOn(formatDateTime(n.editedAt, locale))}
                    {n.expiresAt && n.expiresAt > now && t.expiresOn(formatDateTime(n.expiresAt, locale))}
                    {n.attachments.length > 0 && t.attachments(n.attachments.length)}
                    {n.requiresAck && t.ackCount(done.length, audience.length)}
                  </small>
                </div>
                <div style={{ display: "flex", gap: 6, flex: "none" }}>
                  <Link href={`${base}/admin?tab=news&edit=${n.id}`} className="btn tiny">{t.edit}</Link>
                  <form action={deleteNews.bind(null, slug, n.id)}>
                    <ConfirmButton className="btn tiny danger" confirmLabel={t.delete} message={t.deleteNewsConfirm(n.title)}>{t.delete}</ConfirmButton>
                  </form>
                </div>
              </div>
              {n.requiresAck && (
                <details className="acklist">
                  <summary>{t.waitingSummary(waiting.length)}</summary>
                  <div className="acklist-cols">
                    <div>
                      <strong>{t.waiting(waiting.length)}</strong>
                      <AckPeople people={waiting.map(person)} empty={t.allAcked} />
                    </div>
                    <div>
                      <strong>{t.acked(done.length)}</strong>
                      <AckPeople people={done.map((m) => ({ ...person(m), note: formatDateTime(acked.get(m.userId)!, locale) }))} empty={t.noneAcked} />
                    </div>
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

async function DepartmentsTab({ slug, base, t, orgId, editKey }: Ctx & { orgId: string; editKey?: string }) {
  const [departments, members, news, services] = await Promise.all([
    db.department.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
    db.membership.groupBy({ by: ["department"], where: { orgId }, _count: true }),
    db.news.groupBy({ by: ["audience"], where: { orgId }, _count: true }),
    db.service.groupBy({ by: ["audience"], where: { orgId }, _count: true }),
  ]);
  const count = (rows: { key: string | null; n: number }[], key: string) => rows.find((r) => r.key === key)?.n ?? 0;
  const memberRows = members.map((m) => ({ key: m.department, n: m._count }));
  const targetRows = [...news, ...services].map((r) => ({ key: r.audience, n: r._count }));
  const editing = departments.find((d) => d.key === editKey);

  return (
    <div className="two-col">
      <section className="card panel">
        <h3>{t.departmentsTitle(departments.length)}</h3>
        <p className="low">{t.departmentsLead}</p>
        {departments.length === 0 && <div className="empty" style={{ marginTop: 12 }}>{t.noDepartments}</div>}
        {departments.map((d) => {
          const people = count(memberRows, d.key);
          const targets = targetRows.filter((r) => r.key === d.key).reduce((sum, r) => sum + r.n, 0);
          return (
            <div className="adcard" key={d.key} style={editing?.key === d.key ? { borderColor: "var(--brand)" } : undefined}>
              <div style={{ minWidth: 0 }}>
                <b>{d.name}</b>
                <small>
                  {t.deptMembers(people)}
                  {targets > 0 && t.deptUsed(targets)}
                </small>
              </div>
              <div style={{ display: "flex", gap: 6, flex: "none" }}>
                <Link href={`${base}/admin?tab=departments&edit=${d.key}`} className="btn tiny">{t.edit}</Link>
                {targets === 0 && (
                  <form action={deleteDepartment.bind(null, slug, d.key)}>
                    <ConfirmButton className="btn tiny danger" confirmLabel={t.delete} message={t.deleteDeptConfirm(d.name, people)}>{t.delete}</ConfirmButton>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </section>
      <section className="card panel">
        {editing ? (
          <>
            <h3>{t.renameDept}</h3>
            <ActionForm key={editing.key} org={slug} action={renameDepartment} submitLabel={t.save} resetOnSuccess={false} cancelHref={`${base}/admin?tab=departments`}>
              <input type="hidden" name="key" value={editing.key} />
              <div className="field">
                <label htmlFor="dept-name">{t.deptName}</label>
                <input id="dept-name" name="name" required maxLength={60} defaultValue={editing.name} />
              </div>
            </ActionForm>
          </>
        ) : (
          <>
            <h3>{t.addDept}</h3>
            <ActionForm org={slug} action={createDepartment} submitLabel={t.addDept}>
              <div className="field">
                <label htmlFor="dept-name">{t.deptName}</label>
                <input id="dept-name" name="name" required maxLength={60} placeholder={t.deptPlaceholder} />
              </div>
            </ActionForm>
          </>
        )}
      </section>
    </div>
  );
}

async function ServicesTab({ slug, base, t, admin }: Ctx & { admin: Awaited<ReturnType<typeof requireAdmin>> }) {
  if (!admin.org.taskEnabled) {
    return (
      <section className="card panel">
        <div className="notice">
          {t.servicesNeedTask}{" "}
          <Link href={`${base}/admin?tab=connections`} className="inline-link">{t.connectTaskFirst}</Link>
        </div>
      </section>
    );
  }
  const [services, workspaces, departments] = await Promise.all([
    db.service.findMany({ where: { orgId: admin.orgId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    getTaskProjects(admin),
    getDepartments(admin.orgId),
  ]);
  return (
    <div className="two-col">
      <section className="card panel">
        <h3>{t.companyServices}</h3>
        <p className="low">{t.servicesLead}</p>
        {services.length === 0 && <div className="empty" style={{ marginTop: 12 }}>{t.noServices}</div>}
        {services.map((s) => (
          <div className="adcard" key={s.id}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b>
                {SERVICE_ICONS[s.icon]} {s.name}
              </b>{" "}
              <span className="chip gray">{s.audience === "all" ? t.everyoneChip : (departments[s.audience] ?? s.audience)}</span>
              <small>
                Task: {s.taskLabel} · {s.openMode === "form" ? t.opensForm : t.opensBoard}
              </small>
            </div>
            <form action={deleteService.bind(null, slug, s.id)}>
              <ConfirmButton className="btn tiny danger" confirmLabel={t.delete} message={t.deleteServiceConfirm(s.name)}>{t.delete}</ConfirmButton>
            </form>
          </div>
        ))}
      </section>
      <section className="card panel">
        <h3>{t.addService}</h3>
        {workspaces === null ? (
          <div className="notice error">{t.taskUnreachable}</div>
        ) : workspaces.every((w) => w.projects.length === 0) ? (
          <div className="notice">{t.noProjects(admin.user.email)}</div>
        ) : (
          <ActionForm org={slug} action={createService} submitLabel={t.addService}>
            <div className="field">
              <label htmlFor="svcName">{t.serviceName}</label>
              <input id="svcName" name="name" required maxLength={60} placeholder={t.serviceNamePlaceholder} />
            </div>
            <div className="field">
              <label htmlFor="svcDesc">{t.description}</label>
              <input id="svcDesc" name="description" maxLength={120} placeholder={t.descriptionPlaceholder} />
            </div>
            <div className="field">
              <label htmlFor="svcIcon">{t.icon}</label>
              <select id="svcIcon" name="icon" defaultValue="wrench">
                {Object.entries(SERVICE_ICONS).map(([k, glyph]) => (
                  <option key={k} value={k}>
                    {glyph} {k}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="svcProject">{t.project}</label>
              <select id="svcProject" name="project" required defaultValue="">
                <option value="" disabled>
                  {t.pickProject}
                </option>
                {workspaces.map((w) => (
                  <optgroup key={w.id} label={w.name}>
                    {w.projects.map((p) => (
                      <option key={p.id} value={`${w.id}|${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="svcMode">{t.onOpen}</label>
              <select id="svcMode" name="openMode" defaultValue="board">
                <option value="board">{t.openBoard}</option>
                <option value="form">{t.openForm}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="svcAudience">{t.whoCanUse}</label>
              <select id="svcAudience" name="audience" defaultValue="all">
                <option value="all">{t.everyoneInCompany}</option>
                {Object.entries(departments).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <small className="quiet">{t.taskRightsNote}</small>
          </ActionForm>
        )}
      </section>
    </div>
  );
}

async function LinksTab({ slug, base, t, orgId }: Ctx & { orgId: string }) {
  const links = await db.appLink.findMany({ where: { orgId, visibility: "COMPANY" }, orderBy: { createdAt: "asc" } });
  return (
    <section className="card panel">
      <div className="notice">
        {t.linksNoteA} <Link href={`${base}/launcher`} className="inline-link">{t.shortcuts}</Link> {t.linksNoteB}
      </div>
      {links.length === 0 && <div className="empty" style={{ marginTop: 12 }}>{t.noCompanyLinks}</div>}
      {links.map((l) => (
        <div className="adcard" key={l.id}>
          <div style={{ minWidth: 0 }}>
            <b>{l.name}</b>
            <small>{l.url}</small>
          </div>
          <form action={deleteLink.bind(null, slug, l.id)}>
            <ConfirmButton className="btn tiny danger" confirmLabel={t.delete} message={t.deleteLinkConfirm(l.name)}>{t.delete}</ConfirmButton>
          </form>
        </div>
      ))}
    </section>
  );
}

async function ConnectionsTab({ slug, t, org }: Ctx & { org: { hrEnabled: boolean; hrBaseUrl: string | null; taskEnabled: boolean } }) {
  const hrUrl = org.hrBaseUrl ?? `${HR_DEFAULT_ORIGIN}/${slug}`;
  const databases = org.hrEnabled ? [] : await listHrDatabases(slug, hrUrl);
  const status = (on: boolean) => <span className={`chip ${on ? "" : "gray"}`}>{on ? t.connected : t.notConnected}</span>;
  const disconnect = (system: "hr" | "task") => (
    <form action={setSystemConnected.bind(null, slug, system, false)}>
      <ConfirmButton className="btn tiny" message={t.disconnectConfirm(system === "hr" ? "HR Excellence" : "TaskExcellence")}>{t.disconnect}</ConfirmButton>
    </form>
  );
  return (
    <section className="card panel" style={{ maxWidth: 720 }}>
      <div className="adcard">
        <div style={{ flex: 1 }}>
          <b>TaskExcellence</b> {status(org.taskEnabled)}
          <small>{t.taskNote}</small>
        </div>
        {org.taskEnabled ? (
          disconnect("task")
        ) : (
          <form action={setSystemConnected.bind(null, slug, "task", true)}>
            <button className="btn tiny primary">{t.connect}</button>
          </form>
        )}
      </div>
      <div className="adcard" style={org.hrEnabled ? undefined : { display: "block" }}>
        <div style={{ flex: 1 }}>
          <b>HR Excellence</b> {status(org.hrEnabled)}
          <small>{org.hrEnabled ? org.hrBaseUrl : t.hrDesc}</small>
        </div>
        {org.hrEnabled ? disconnect("hr") : <HrConnectForm slug={slug} defaultUrl={hrUrl} initialDatabases={databases} />}
      </div>
    </section>
  );
}

async function MembersTab({ slug, t, locale, orgId, selfId, hrEnabled }: Ctx & { orgId: string; selfId: string; hrEnabled: boolean }) {
  const [members, invites, requests, departments] = await Promise.all([
    db.membership.findMany({ where: { orgId }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { orgId, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
    db.joinRequest.findMany({ where: { orgId }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    getDepartments(orgId),
  ]);
  return (
    <div className="two-col">
      <section className="card panel">
        {requests.length > 0 && (
          <>
            <h3>{t.joinRequests(requests.length)}</h3>
            {requests.map((r) => (
              <div className="adcard" key={r.id} style={{ borderColor: "#f1ddb0", background: "#fffaf1" }}>
                <div style={{ minWidth: 0 }}>
                  <b>{r.user.name ?? r.user.email}</b>
                  <small>
                    {r.user.email} · {t.requestedOn(formatDate(r.createdAt, locale))}
                  </small>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <form action={decideJoinRequest.bind(null, slug, r.id, true)}>
                    <button className="btn tiny primary">{t.approve}</button>
                  </form>
                  <form action={decideJoinRequest.bind(null, slug, r.id, false)}>
                    <ConfirmButton className="btn tiny danger" confirmLabel={t.reject} message={t.rejectConfirm(r.user.name ?? r.user.email)}>{t.reject}</ConfirmButton>
                  </form>
                </div>
              </div>
            ))}
            <div style={{ height: 18 }} />
          </>
        )}
        <h3>{t.members(members.length)}</h3>
        <p className="low">{t.adminNote}</p>
        {members.map((m) => (
          <div className="adcard" key={m.id}>
            <div style={{ minWidth: 0 }}>
              <b>
                {m.user.name ?? m.user.email} {m.id === selfId && <span className="chip gray">{t.you}</span>}
              </b>
              <small>{m.user.email}</small>
              <small>{m.user.lastLoginAt ? t.lastLogin(formatDateTime(m.user.lastLoginAt, locale)) : t.neverLoggedIn}</small>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <form action={setMemberDepartment.bind(null, slug, m.id)}>
                <AutoSubmitSelect name="department" className="orgswitch" aria-label={t.deptOf(m.user.name ?? m.user.email)} defaultValue={m.department ?? ""}>
                  <option value="">{t.noDept}</option>
                  {Object.entries(departments).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </AutoSubmitSelect>
              </form>
              <span className={`chip ${m.role === "ADMIN" ? "warn" : "gray"}`}>{m.role === "ADMIN" ? "Admin" : "Employee"}</span>
              <form action={setMemberRole.bind(null, slug, m.id, m.role === "ADMIN" ? "EMPLOYEE" : "ADMIN")}>
                <button className="btn tiny">{m.role === "ADMIN" ? t.makeEmployee : t.makeAdmin}</button>
              </form>
              {m.id !== selfId && (
                <form action={removeMember.bind(null, slug, m.id)}>
                  <ConfirmButton className="btn tiny danger" confirmLabel={t.remove} message={t.removeConfirm(m.user.name ?? m.user.email)}>{t.remove}</ConfirmButton>
                </form>
              )}
            </div>
          </div>
        ))}
      </section>
      <section className="card panel">
        <h3>{t.invite}</h3>
        <p className="low">{t.inviteLead}</p>
        <InviteMembersForm slug={slug} departments={departments} hrEnabled={hrEnabled} />
        {invites.length > 0 && <div className="launcher-group">{t.pendingInvites(invites.length)}</div>}
        {invites.map((inv) => (
          <div className="adcard" key={inv.id}>
            <div style={{ minWidth: 0 }}>
              <b>{inv.email}</b>
              <small>
                {inv.role === "ADMIN" ? "Admin" : "Employee"} · {t.invitedBy(inv.invitedBy)} · {formatDate(inv.createdAt, locale)}
              </small>
            </div>
            <form action={revokeInvitation.bind(null, slug, inv.id)}>
              <ConfirmButton className="btn tiny danger" message={t.revokeConfirm(inv.email)}>{t.cancel}</ConfirmButton>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
