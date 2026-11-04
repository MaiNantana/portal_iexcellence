# Deploy Portal — portal.iexcellence.cloud

Portal อยู่บน Windows server เครื่องเดียวกับ TaskExcellence (`hr.iexcellence.cloud`) รันผ่าน IIS + iisnode
ใช้ MariaDB ตัวเดียวกับ Task (พอร์ต 3307) แต่มี database และ user `portal` แยกของตัวเอง

```
https://portal.iexcellence.cloud ─ IIS site "portal" (SSL) ─ iisnode ─▶ server.js (Next.js)
                                                                        └─▶ MariaDB 127.0.0.1:3307, database "portal"
```

- โค้ด: `C:\Program Files\iisnode\www\portal`
- ค่าลับทั้งหมดอยู่ใน `.env` บน server เท่านั้น ห้าม commit (สร้างโดย `deploy\server-setup.ps1`)
- log ของ node: `C:\Program Files\iisnode\www\portal\iisnode\`

## Deploy อัตโนมัติ (CI/CD)
- **PR / push เข้า branch อื่น** → `.github/workflows/ci.yml` จะรัน lint, typecheck และ build บน GitHub
- **push หรือ merge เข้า `main`** → `.github/workflows/deploy.yml` จะรัน CI ก่อน ถ้าผ่านจะ deploy บน runner ที่ติดตั้งในตัว server เอง:
  1. copy โค้ดลงโฟลเดอร์ site (ไม่แตะ `.env`, `web.config`, `node_modules`, `.next`)
  2. รัน `deploy\deploy.ps1` ซึ่งทำ: หยุด site → `npm ci` → `prisma migrate deploy` → build → เปิด site → smoke test

  ระหว่าง deploy site จะหยุดประมาณ 2–3 นาที
- กด deploy เองได้ที่ GitHub → Actions → **Deploy to production** → **Run workflow**

### ติดตั้ง runner (ทำครั้งเดียว)
Runner เป็น service ชื่อ `actions.runner.MaiNantana-portal_iexcellence.*` อยู่ที่ `C:\actions-runner-portal` รันด้วยบัญชี SYSTEM
ถ้าต้องติดตั้งใหม่:
1. GitHub repo → Settings → Actions → Runners → **New self-hosted runner** (Windows) แล้ว copy token
2. บน server รัน PowerShell แบบ Administrator:
   ```powershell
   cd C:\actions-runner-portal
   .\config.cmd --unattended --url https://github.com/MaiNantana/portal_iexcellence --token <TOKEN> `
     --name portal-prod --labels portal --runasservice --windowslogonaccount "NT AUTHORITY\SYSTEM"
   ```

## ติดตั้งครั้งแรกบน server ใหม่
1. DNS `portal.iexcellence.cloud` → IP ของ server และ certificate (win-acme) ให้ IIS site `portal`
2. วางโค้ดที่ `C:\Program Files\iisnode\www\portal` แล้วรัน `npm ci` และ `npm run build`
3. PowerShell แบบ Administrator:
   ```powershell
   powershell -ExecutionPolicy Bypass -File "C:\Program Files\iisnode\www\portal\deploy\server-setup.ps1"
   ```
   สคริปต์จะถามรหัส root ของ MariaDB และ AWS key ของ SES จากนั้นทำต่อให้ทั้งหมด:
   - สร้าง DB และ user
   - สร้าง `.env` พร้อม secret ใหม่
   - migrate
   - ใส่ `web.config`
   - restart site และ smoke test

## Amazon SES (OTP และคำเชิญ)
- ควรมี IAM user แยกสำหรับ Portal ที่มีสิทธิ์แค่ `ses:SendEmail` และ `ses:SendRawEmail`
  เปลี่ยนค่า `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` ใน `.env` แล้ว site จะ restart เอง
- `MAIL_FROM` ต้องเป็น identity ที่ verify ใน SES (`ap-southeast-2`) แล้ว

## เปิดใช้ Task SSO
1. Deploy branch `feat/portal-sso` ของ Task (ตั้ง `PORTAL_ISSUER=https://portal.iexcellence.cloud` แล้ว)
   ตรวจ: `POST https://pmo.iexcellence.cloud:8443/api/auth/portal` ด้วย body `{}` ต้องได้ **401** ถ้าได้ 503 แปลว่ายังไม่ได้ตั้ง `PORTAL_ISSUER`
2. ใน Portal ไปที่ Admin → เชื่อมต่อโปรแกรม แล้วติ๊ก TaskExcellence
   URL ของ Task ตั้งไว้ที่ server แล้ว (`TASK_BASE_URL` / `TASK_API_URL` ค่าเริ่มต้นคือ pmo.iexcellence.cloud)
3. ไม่บังคับ: ใส่ API key ของ workspace บริษัท (Task → API Keys) ถ้าต้องการให้พนักงานถูกเพิ่มเข้า workspace นั้นอัตโนมัติ

## ข้อห้ามบน production
- ห้ามรัน `npm run db:seed` เพราะจะสร้างบัญชีทดสอบที่ใช้รหัสผ่านซึ่งรู้กันทั่วไป
- ห้ามรัน `prisma migrate dev` หรือ `prisma migrate reset` ให้ใช้ `prisma migrate deploy` (อยู่ใน `deploy.ps1` แล้ว)
- ถ้าเปลี่ยน `AUTH_SECRET` ทุกคนจะถูก logout และต้องกรอก API key ของ Task ใหม่
