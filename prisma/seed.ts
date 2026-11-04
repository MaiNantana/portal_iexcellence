import { hash } from "@node-rs/argon2";
import { PrismaClient, type Role } from "@prisma/client";

const db = new PrismaClient();

// Dev-only accounts; all use the password below.
const DEV_PASSWORD = "Passw0rd!2026";

async function devUser(orgId: string, email: string, name: string, role: Role, department: string, passwordHash: string) {
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash, emailVerifiedAt: new Date() },
  });
  await db.membership.upsert({
    where: { orgId_userId: { orgId, userId: user.id } },
    update: {},
    create: { orgId, userId: user.id, role, department },
  });
}

async function main() {
  const abc = await db.org.upsert({
    where: { slug: "abc" },
    update: {},
    create: {
      slug: "abc",
      name: "ABC Company",
      hrEnabled: true,
      hrBaseUrl: "https://hr.iexcellence.net/",
      taskEnabled: true,
      taskBaseUrl: "https://pmo.iexcellence.cloud/",
    },
  });
  const xyz = await db.org.upsert({
    where: { slug: "xyz" },
    update: {},
    // Join link /join/xyz-dev-join needs admin approval.
    create: { slug: "xyz", name: "XYZ Trading", joinMode: "APPROVAL", joinCode: "xyz-dev-join" },
  });
  // Pre-verified so any verified *@abc.test sign-up joins ABC automatically (real domains verify via DNS TXT).
  await db.orgDomain.upsert({
    where: { orgId_domain: { orgId: abc.id, domain: "abc.test" } },
    update: {},
    create: { orgId: abc.id, domain: "abc.test", verifyToken: "iexcellence-verify=dev", verifiedAt: new Date() },
  });

  const pw = await hash(DEV_PASSWORD);
  await devUser(abc.id, "admin@abc.test", "Somchai Admin", "ADMIN", "it", pw);
  await devUser(abc.id, "employee@abc.test", "Siriporn Staff", "EMPLOYEE", "production", pw);
  await devUser(xyz.id, "owner@xyz.test", "Kittipol Owner", "ADMIN", "hr", pw);
  // Invited but not yet signed up: use /login/password to try the OTP flow.
  await db.invitation.upsert({
    where: { orgId_email: { orgId: abc.id, email: "new@abc.test" } },
    update: {},
    create: { orgId: abc.id, email: "new@abc.test", role: "EMPLOYEE", department: "hr", invitedBy: "admin@abc.test" },
  });

  if ((await db.news.count({ where: { orgId: abc.id } })) === 0) {
    const day = (d: number) => new Date(Date.UTC(2026, 9, d, 3));
    await db.news.createMany({
      data: [
        { orgId: abc.id, title: "ตารางอบรมฝ่ายผลิต", body: "กำหนดการอบรมพนักงานฝ่ายผลิตสำหรับสัปดาห์หน้า", channel: "production", audience: "production", authorName: "ฝ่ายผลิต", publishedAt: day(24) },
        { orgId: abc.id, title: "แจ้งปรับปรุงระบบเครือข่าย", body: "ฝ่าย IT จะปรับปรุงระบบเครือข่ายในวันเสาร์ เวลา 20:00–22:00 น.", channel: "it", authorName: "ฝ่าย IT", publishedAt: day(25) },
        { orgId: abc.id, title: "กิจกรรมสุขภาพพนักงานประจำเดือน", body: "กิจกรรมดูแลสุขภาพและอบรมความรู้สำหรับพนักงานทุกแผนก", channel: "events", authorName: "ฝ่ายบุคคล", publishedAt: day(27) },
        { orgId: abc.id, title: "แนวทางความปลอดภัยในการทำงานประจำเดือน", body: "ขอให้พนักงานทุกท่านอ่านข้อปฏิบัติฉบับปรับปรุง และกดรับทราบเมื่ออ่านเรียบร้อยแล้ว", channel: "company", requiresAck: true, authorName: "ฝ่ายทรัพยากรบุคคล", publishedAt: day(28) },
      ],
    });
  }

  if ((await db.appLink.count({ where: { orgId: abc.id } })) === 0) {
    await db.appLink.createMany({
      data: [
        { orgId: abc.id, name: "เว็บไซต์บริษัท", url: "https://example.com", visibility: "COMPANY" },
        { orgId: abc.id, name: "Google Drive", url: "https://drive.google.com", visibility: "COMPANY" },
        { orgId: abc.id, name: "Microsoft 365", url: "https://www.microsoft365.com", visibility: "COMPANY" },
      ],
    });
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
