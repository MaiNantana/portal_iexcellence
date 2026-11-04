# iExcellence Company Workspace (Portal)

Portal กลางแบบ multi-tenant ที่รวมข่าวสาร ทางลัด และทางเข้า HR Excellence / TaskExcellence
พนักงาน login ที่ Portal จุดเดียว ด้วย **Google, Microsoft หรือ Email + รหัสผ่าน** และใช้อีเมลที่ยืนยันแล้วเป็นตัวตนกลางระหว่างระบบ

Stack: Next.js 15 (App Router, Server Actions) · Auth.js v5 · Prisma + MariaDB · argon2id · nodemailer

## เริ่มต้น (dev)

ฐานข้อมูลใช้ MariaDB ที่ติดตั้งในเครื่อง (พอร์ต 3307)
สร้าง database และ user ครั้งแรกด้วย `scripts/mariadb-setup.sql` แล้วตั้งค่า `.env` ตาม `.env.example`

```bash
mysql -h 127.0.0.1 -P 3307 -u root -p < scripts/mariadb-setup.sql   # ครั้งแรกเท่านั้น
npm install
npm run db:migrate
npm run db:seed
npm run dev          # http://localhost:3000
```

บัญชีทดสอบ (รหัสผ่าน `Passw0rd!2026`):

| อีเมล | บริษัท | บทบาท |
|---|---|---|
| admin@abc.test | ABC Company | Admin |
| employee@abc.test | ABC Company | Employee · ฝ่ายผลิต |
| owner@xyz.test | XYZ Trading | Admin · ใช้ทดสอบการแยกข้อมูลระหว่างบริษัท |
| new@abc.test | ABC Company | ได้รับเชิญแต่ยังไม่มีรหัสผ่าน · ใช้ทดสอบ `/abc/login/password` |

ถ้ายังไม่ได้ตั้ง `SMTP_HOST` ใน dev ระบบจะพิมพ์อีเมล (รหัส OTP และคำเชิญ) ออกที่ console ของ `npm run dev`

## การแยกบริษัท (multi-tenant)

ทุกบริษัทใช้เว็บเดียวกัน และแยกกันด้วย **รหัสบริษัทใน URL** ทุกหน้าของระบบอยู่หลังรหัสบริษัท:

```
/                       login กลาง · ถ้า login แล้วจะพาไปบริษัทล่าสุด · ถ้ายังไม่มีบริษัทจะเป็นหน้าสร้าง/เข้าร่วมบริษัท
/?mode=password         สมัคร / ตั้งรหัสผ่าน (แบบกลาง)
/?start=1               สร้างหรือเข้าร่วมบริษัทอื่น (สำหรับคนที่มีบริษัทแล้ว)
/abc/login              หน้า login ของ ABC (ขึ้นชื่อบริษัท แล้วกลับมาที่ /abc)
/abc/login/password     สมัคร / ตั้งรหัสผ่าน
/abc/join/<code>        ลิงก์เข้าร่วมของ ABC
/abc  /abc/launcher  /abc/admin  /abc/news/<id>
/api/auth/...           Auth.js (อยู่ที่ root เพียงตัวเดียว)
```

ที่ root จึงมีแค่ `/` กับ `/api` คำสงวนของรหัสบริษัทเหลือเพียง `api`, `assets`, `static`, `www`
หน้าใหม่ในอนาคตให้วางไว้ใต้ `src/app/[slug]/` จะได้ไม่ชนกับรหัสบริษัท
- `src/app/[slug]/(workspace)/` คือหน้าที่ต้องเป็นสมาชิกของบริษัท
- `src/app/[slug]/(public)/` คือหน้าที่เปิดได้โดยยังไม่เป็นสมาชิก (login, join)

- ทุกหน้าและทุก server action รับ slug ของบริษัทเข้ามา แล้วตรวจ membership จาก DB ผ่าน `requireMember(slug)` / `requireAdmin(slug)`
  ถ้าไม่ได้เป็นสมาชิกของบริษัทใน URL จะได้ **404** และทุก query ของข้อมูลกรองด้วย `orgId` ของ membership นั้น
- คนที่อยู่หลายบริษัทเปิดหลายบริษัทพร้อมกันในหลายแท็บได้ และสลับบริษัทได้จาก header
- Admin เปลี่ยนชื่อบริษัทและรหัสบริษัทได้ที่ Admin → การเข้าร่วม (รหัสใช้ได้ a-z, 0-9, - ยาว 3–30 ตัว)
- `src/middleware.ts` ส่งคนที่ยังไม่ login ไปหน้า `/<บริษัท>/login` พร้อมจำ path เดิมไว้ แต่การตรวจสิทธิ์จริงยังอยู่ฝั่ง server

## การ login และตัวตน

- **ใครเข้าได้:** ใครก็สมัครได้ด้วยอีเมลที่ยืนยันแล้ว แต่จะเห็นข้อมูลบริษัทได้ก็ต่อเมื่อเป็นสมาชิก ซึ่งเป็นได้ 4 ทาง: คำเชิญ, โดเมนอีเมลที่บริษัทยืนยันแล้ว, ลิงก์เข้าร่วม หรือสร้างบริษัทเอง
- **Email + รหัสผ่าน:** ครั้งแรกหรือตอนลืมรหัสผ่าน ให้ไปที่ `/<บริษัท>/login/password` (หรือ `/?mode=password`) ระบบจะส่ง OTP 6 หลัก (อายุ 10 นาที ลองได้ 5 ครั้ง) เพื่อยืนยันอีเมลก่อนตั้งรหัสผ่าน
  รหัสผ่านเก็บแบบ argon2id ถ้าใส่ผิด 5 ครั้งบัญชีจะถูกล็อก 15 นาที
- **Google:** รับเฉพาะ `email_verified = true`
- **Microsoft:** รับเฉพาะเมื่อ token มี claim `xms_edov = true` (อีเมลยืนยันโดยโดเมน)
  ต้องเพิ่ม optional claim `xms_edov` ใน App registration → Token configuration ก่อน ไม่อย่างนั้นทุกคนที่ใช้ Microsoft จะเข้าไม่ได้
  ที่ต้องเข้มงวดเพราะ Entra อนุญาตให้ตั้งอีเมลที่ไม่ได้ยืนยันได้ ถ้าไม่ตรวจ จะมีคนอ้างอีเมลของคนอื่นได้
- คนเดียวมีได้หลายวิธี login: Google / Microsoft ที่ใช้อีเมลเดียวกันจะผูกเข้ากับ `User` เดียวกัน (ตาราง `identities`)
- คนเดียวอยู่ได้หลายบริษัท: ตัวสลับบริษัทจะขึ้นที่ header บริษัทที่เลือกเก็บใน `User.lastOrgId`
- ทุกหน้าและทุก action ผ่าน `requireMember()` / `requireAdmin()` (`src/lib/context.ts`) ซึ่งตรวจ membership จาก DB ทุกครั้ง
  สมาชิกที่ถูกนำออกจะหมดสิทธิ์ทันที แม้ session cookie ยังไม่หมดอายุ

## ขั้นต่อไป: เชื่อม HR / Task

- **Task** (login ด้วย email อยู่แล้ว): จับคู่อัตโนมัติด้วย `org + email`
- **HR** (login ด้วย username): ผู้ใช้กด "เชื่อมบัญชี HR" แล้ว login ที่หน้าของ HR เองหนึ่งครั้ง HR ส่ง code กลับมา แล้ว Portal บันทึก `hr_user_id` ใน `account_links`
  Portal ไม่เคยเห็นรหัสผ่านของ HR
- **ใช้งานประจำ:** Portal ออก token อายุ 60 วินาที (เซ็นด้วย private key, ใช้ได้ครั้งเดียว) ไปที่ `/auth/portal` ของ HR/Task เพื่อเข้าระบบโดยไม่ต้อง login ซ้ำ

## Production checklist

- `AUTH_SECRET` ใหม่ (`npx auth secret`) และ `AUTH_URL` เป็นโดเมนจริง (HTTPS)
- ตั้งค่า SMTP (ใน production ถ้าไม่มี SMTP ระบบจะ error แทนการพิมพ์ OTP ลง log)
- Google / Microsoft: ลงทะเบียน redirect URI ของโดเมนจริง และเปิด claim `xms_edov` ของ Microsoft
- ห้ามรัน `npm run db:seed` บน production (seed มีบัญชีทดสอบ)

## เชื่อม TaskExcellence (ทำแล้ว)

- ปุ่ม Task ใน Portal ชี้ไปที่ `/<บริษัท>/go/task` แล้ว Portal ทำสองอย่าง:
  1. ถ้าตั้ง API key ไว้ จะเรียก `/api/external/connect` ของ Task เพื่อเพิ่มผู้ใช้เข้า workspace ของบริษัท
  2. เซ็น JWT (ES256, อายุ 60 วินาที, ใช้ได้ครั้งเดียว) แล้ว redirect ไปที่ `<Task>/portal-login#token=…`
- public key ของ Portal อยู่ที่ `/api/portal/jwks.json`
- สร้าง signing key ด้วย `node scripts/gen-signing-key.mjs` แล้วใส่ใน `.env`
- API key ของ Task เก็บใน DB แบบเข้ารหัส AES-GCM โดยใช้ key ที่สร้างจาก `AUTH_SECRET` (`src/lib/secrets.ts`)
  ถ้าเปลี่ยน `AUTH_SECRET` ต้องกรอก API key ใหม่
- ฝั่ง Task ดู `D:\ixcl\taskmanagement_v13\docs\PORTAL_SSO.md` (branch `feat/portal-sso`)
